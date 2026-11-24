import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { upsertIdentity } from "../auth/identity";
import { cronAuthorized } from "../cron-auth";
import { createMemoryDb, type Db } from "../db/client";
import { ingestionRuns, opportunities, opportunitySourceRefs, opportunitySources } from "../db/schema";
import { adapterFor, missingConfig } from "../ingestion/adapters";
import { ashbyToRaw, greenhouseToRaw, inIndia, KNOWN_BOARDS, leverToRaw } from "../ingestion/ats";
import { parseCsv } from "../ingestion/csv";
import { discoveryLinks } from "../ingestion/discovery";
import { normalizeListing } from "../ingestion/normalize";
import { curatedRegistry } from "../intelligence/registry";
import { claimDueSource, ensureSourceRegistry, publishReadyFromSource, runIngestion, runScheduledIngestion, sourceCoverage } from "./ingestion";
import { setSourcePermission } from "./verification";

const reg = curatedRegistry();
const NOW = new Date("2026-11-24T06:00:00Z");
const DESC = "<p>Build data pipelines with SQL and Python for our payments analytics team in Bengaluru.</p>";

describe("employer job-board adapters (fixtures)", () => {
  it("Greenhouse: maps fields, keeps India, drops elsewhere", () => {
    const r = greenhouseToRaw({ id: 101, title: "Data Engineer Intern", absolute_url: "https://boards.greenhouse.io/acme/jobs/101", location: { name: "Bengaluru, India" }, content: "&lt;p&gt;Build data pipelines with SQL and Python for our payments analytics team.&lt;/p&gt;", updated_at: "2026-11-20T10:00:00Z" }, "Acme")!;
    expect(r).toMatchObject({ sourceRecordId: "101", organization: "Acme", type: "internship", locations: ["Bengaluru, India"], applyUrl: "https://boards.greenhouse.io/acme/jobs/101" });
    const n = normalizeListing(r, { supportedTypes: ["job", "internship", "apprenticeship"], registry: reg, now: NOW });
    expect(n.ok && n.listing.description).toBe("Build data pipelines with SQL and Python for our payments analytics team.");
    expect(n.ok && n.listing.compMin).toBeNull();
    expect(greenhouseToRaw({ id: 102, title: "Engineer", absolute_url: "https://x/102", location: { name: "Dublin, Ireland" } }, "Acme")).toBeNull();
  });
  it("Lever: workplace type, commitment and lists become the description", () => {
    const r = leverToRaw({ id: "abc", text: "Backend Engineer", hostedUrl: "https://jobs.lever.co/acme/abc", workplaceType: "hybrid", description: DESC, lists: [{ text: "Requirements", content: "<li>Node.js</li><li>PostgreSQL</li>" }], categories: { location: "Pune", commitment: "Full-time" }, createdAt: Date.parse("2026-11-01") }, "Acme")!;
    expect(r).toMatchObject({ workMode: "hybrid", employmentType: "Full-time", type: "job", locations: ["Pune"] });
    const n = normalizeListing(r, { supportedTypes: ["job", "internship", "apprenticeship"], registry: reg, now: NOW });
    expect(n.ok && n.listing.employmentType).toBe("full_time");
    expect(n.ok && n.listing.skills.map((s) => s.conceptId)).toEqual(expect.arrayContaining(["nodejs", "postgres"]));
  });
  it("Ashby: unlisted jobs and remote roles with no stated country are left out", () => {
    expect(ashbyToRaw({ id: "1", title: "PM", location: "Mumbai", isListed: false }, "Acme")).toBeNull();
    expect(ashbyToRaw({ id: "2", title: "PM", location: "Remote", isRemote: true, descriptionHtml: DESC }, "Acme")).toBeNull();
    expect(ashbyToRaw({ id: "3", title: "PM", location: "Remote - India", isRemote: true, descriptionHtml: DESC, employmentType: "Intern", jobUrl: "https://jobs.ashbyhq.com/acme/3" }, "Acme")).toMatchObject({ type: "internship", workMode: "remote" });
    expect(inIndia(["Remote"], true)).toBe(false);
  });
  it("every known board resolves to an adapter with a fixed host allow-list", () => {
    for (const b of KNOWN_BOARDS) {
      const a = adapterFor(`${b.family}:${b.id}`)!;
      expect(a.accessMethod).toBe("employer_job_board_api");
      expect(a.allowedHosts({ sourceUrl: null, env: {} })).toHaveLength(1);
      expect(missingConfig(a, {}, null)).toEqual([]);
    }
  });
});

describe("cron authentication", () => {
  const secret = "s".repeat(40);
  it("accepts only the exact bearer secret, and never a short or missing one", () => {
    expect(cronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(cronAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(cronAuthorized(secret, secret)).toBe(false);
    expect(cronAuthorized(null, secret)).toBe(false);
    expect(cronAuthorized("Bearer short", "short")).toBe(false);
    expect(cronAuthorized("Bearer ", undefined)).toBe(false);
  });
});

describe("links-only fallback, coverage and CSV", () => {
  it("builds official search links only for sources not disabled", () => {
    const all = discoveryLinks({ query: "Data analyst", type: null, families: new Set(["aicte_internship", "ncs", "nats", "naukri"]) });
    expect(all.find((l) => l.family === "aicte_internship")!.url).toBe("https://internship.aicte-india.org/internships?q=Data%20analyst");
    expect(all.find((l) => l.family === "naukri")!.url).toBe("https://www.naukri.com/data-analyst-jobs");
    expect(all.every((l) => l.url.startsWith("https://"))).toBe(true);
    expect(discoveryLinks({ query: "x", type: null, families: new Set(["ncs"]) }).every((l) => l.family === "ncs")).toBe(true);
    expect(discoveryLinks({ query: "<script>", type: "internship", families: new Set(["aicte_internship"]) })[0].url).not.toContain("<");
  });
  it("reports each source's real coverage and the action that unblocks it", () => {
    const base = { url: null, active: false, permissionStatus: "unreviewed", consecutiveFailures: 0, lastError: null, kind: "feed" };
    expect(sourceCoverage({ ...base, adapterKey: "naukri" }).mode).toBe("links_only");
    expect(sourceCoverage({ ...base, adapterKey: "ncs" }, {})).toMatchObject({ mode: "links_only", action: expect.stringContaining("AVSAR_SRC_NCS_FEED_URL") });
    expect(sourceCoverage({ ...base, adapterKey: "greenhouse:groww" }).action).toContain("Approved for collection");
    expect(sourceCoverage({ ...base, adapterKey: "greenhouse:groww", permissionStatus: "approved_collection" }).action).toBe("Switch the source on.");
    expect(sourceCoverage({ ...base, adapterKey: "greenhouse:groww", permissionStatus: "approved_collection", active: true })).toEqual({ mode: "automated", action: null });
    expect(sourceCoverage({ ...base, adapterKey: null, kind: "manual" }).mode).toBe("import_only");
  });
  it("parses CSV with quotes and skill lists", () => {
    const rows = parseCsv('title,organization,description,skills\n"Intern, Data","Acme ""Labs""",Some text,SQL; Excel\n');
    expect(rows).toEqual([{ title: "Intern, Data", organization: 'Acme "Labs"', description: "Some text", skills: ["SQL", "Excel"] }]);
    expect(() => parseCsv("name\nx")).toThrow(/title and organization/);
    expect(() => parseCsv('title,organization\n"open')).toThrow(/Unclosed/);
  });
});

describe("scheduled ingestion (database)", () => {
  let db: Db;
  let adminId: string;
  let groww: string;
  let meesho: string;
  const job = (id: string, title = `Analyst ${id}`) => ({ sourceRecordId: id, title, organization: "Groww", type: "job", locations: ["Bengaluru, India"], description: "Analyse investment data with SQL and build dashboards for the product team every week.", applyUrl: `https://boards.greenhouse.io/groww/jobs/${id}`, sourceUrl: `https://boards.greenhouse.io/groww/jobs/${id}` });
  // Distinct vacancies per platform, so each source owns its own listings (shared URLs would be merged as duplicates).
  const listing = { collect: async (a: { family: string }) => ({ records: a.family === "greenhouse" ? [job("1"), job("2"), job("3")] : [{ ...job("m1", "Risk analyst"), organization: "Meesho", applyUrl: "https://jobs.lever.co/meesho/m1", sourceUrl: "https://jobs.lever.co/meesho/m1" }], complete: true }) };

  beforeAll(async () => {
    db = await createMemoryDb();
    adminId = (await upsertIdentity(db, { provider: "dev", subject: "src-admin", email: null, emailVerified: false, name: "Admin" })).id;
    await ensureSourceRegistry(db);
    const rows = await db.select().from(opportunitySources);
    groww = rows.find((r) => r.adapterKey === "greenhouse:groww")!.id;
    meesho = rows.find((r) => r.adapterKey === "lever:meesho")!.id;
    expect(rows.filter((r) => r.adapterKey?.includes(":")).every((r) => r.permissionStatus === "unreviewed" && !r.active)).toBe(true);
  });

  it("claims nothing until a source is approved and switched on", async () => {
    expect(await claimDueSource(db, NOW)).toBeNull();
    for (const id of [groww, meesho]) {
      await setSourcePermission(db, id, "approved_collection", { reviewerId: adminId, evidence: "Employer's public Greenhouse/Lever job board, checked 2026-11-24 (test)" });
      await db.update(opportunitySources).set({ active: true, nextRunAt: null }).where(eq(opportunitySources.id, id));
    }
  });
  it("leases each due source once: a second claim never gets the same source", async () => {
    const a = await claimDueSource(db, NOW);
    const b = await claimDueSource(db, NOW);
    const c = await claimDueSource(db, NOW);
    expect(new Set([a, b]).size).toBe(2);
    expect(c).toBeNull();
    await db.update(opportunitySources).set({ nextRunAt: null }).where(eq(opportunitySources.active, true));
  });
  it("runs due sources in one pass, then nothing is due; listings land in review with attribution", async () => {
    const s = await runScheduledIngestion(db, { budgetMs: 30_000, deps: listing, now: () => NOW });
    expect(s.sources).toHaveLength(2);
    expect(s.stoppedBy).toBe("done");
    expect((await runScheduledIngestion(db, { budgetMs: 30_000, deps: listing, now: () => NOW })).sources).toHaveLength(0);
    const rows = await db.select().from(opportunities).where(eq(opportunities.sourceId, groww));
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "in_review" && r.sourceProvider === "Groww" && r.sourceUrl?.startsWith("https://boards.greenhouse.io/groww/") && r.verificationState === "source_confirmed")).toBe(true);
  });
  it("repeated runs create no duplicates", async () => {
    await runIngestion(db, groww, { trigger: "manual", deps: listing, now: NOW });
    await runIngestion(db, groww, { trigger: "manual", deps: listing, now: NOW });
    expect(await db.select().from(opportunities).where(eq(opportunities.sourceId, groww))).toHaveLength(3);
    expect(await db.select().from(opportunitySourceRefs).where(eq(opportunitySourceRefs.sourceId, groww))).toHaveLength(3);
  });
  it("bulk publish publishes only listings that pass every check", async () => {
    const [bad] = await db.select().from(opportunities).where(eq(opportunities.sourceRecordId, "3"));
    await db.update(opportunities).set({ contentFlags: ["instruction_override"] }).where(eq(opportunities.id, bad.id));
    const r = await publishReadyFromSource(db, groww, adminId);
    expect(r).toMatchObject({ skipped: 1 });
    expect(r.published).toBeGreaterThanOrEqual(2);
    expect((await db.select().from(opportunities).where(eq(opportunities.id, bad.id)))[0].status).toBe("in_review");
  });
  it("a failed run never unpublishes or marks listings stale", async () => {
    await runIngestion(db, groww, { trigger: "manual", now: NOW, deps: { collect: async () => { throw new Error("timeout"); } } });
    const rows = await db.select().from(opportunities).where(eq(opportunities.sourceId, groww));
    expect(rows.filter((r) => r.status === "published").length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.staleSince === null)).toBe(true);
  });
  it("a run cut short by the time budget is partial, marks nothing missing and stays due", async () => {
    const run = await runIngestion(db, groww, { trigger: "schedule", now: NOW, deadlineAt: Date.now() - 1, deps: { collect: async () => ({ records: [job("1")], complete: true }) } });
    // A complete list without records 2 and 3 would normally mark them missing; a cut-short run must not.
    expect(run.status).toBe("partial");
    expect((await db.select().from(opportunitySourceRefs).where(eq(opportunitySourceRefs.sourceId, groww))).every((r) => r.missingSince === null)).toBe(true);
    expect((await db.select().from(opportunitySources).where(eq(opportunitySources.id, groww)))[0].nextRunAt?.getTime()).toBe(NOW.getTime());
  });
  it("stops at the time budget and leaves the rest for the next pass", async () => {
    await db.update(opportunitySources).set({ nextRunAt: null }).where(eq(opportunitySources.active, true));
    const s = await runScheduledIngestion(db, { budgetMs: 0, deps: listing, now: () => NOW });
    expect(s).toMatchObject({ stoppedBy: "time_budget", sources: [] });
    expect((await runScheduledIngestion(db, { budgetMs: 30_000, maxSources: 1, deps: listing, now: () => NOW })).stoppedBy).toBe("max_sources");
  });
  it("records every run", async () => {
    expect((await db.select().from(ingestionRuns)).length).toBeGreaterThanOrEqual(6);
  });
});
