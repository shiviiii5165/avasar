import { beforeAll, describe, expect, it } from "vitest";

import { createMemoryDb, type Db } from "../db/client";
import { opportunities, opportunitySkills } from "../db/schema";
import { canonicalize, roleTitle, sameOpening } from "../ingestion/dedupe";
import { discoveryRules } from "./discovery";
import { recommend } from "../domain/recommend";
import { canonicalIdSet, hasAnyId, listOpenOpportunities, PAGE_SIZE, recordIdIn, searchOpportunities, searchSchema, toFacts } from "./opportunities";

const RUBRIK_TITLE = "Senior AI Engineer - Enterprise Agentic Systems";
const RUBRIK_DESC = "Build agentic AI systems for enterprise data security. Design LLM-based agents, evaluation pipelines and retrieval. Work with Python and distributed systems.";

describe("canonical opportunities (pure)", () => {
  const rec = (id: string, over: Record<string, unknown> = {}) => ({
    id, locations: ["Bengaluru"], verification: "unverified", sourceId: "s-greenhouse", sourceRecordId: id, urls: [`https://boards.example.com/rubrik/${id}`], fingerprint: `fp-${id}`,
    title: RUBRIK_TITLE, organization: "Rubrik", workMode: "onsite", description: RUBRIK_DESC, deadline: null, ...over,
  });
  const run = (list: ReturnType<typeof rec>[]) => canonicalize(list, (x) => x);

  it("regression: the same Rubrik role, once per city and per feed, is ONE opportunity listing every city", () => {
    const out = run([
      rec("r1", { locations: ["Bengaluru"] }),
      rec("r2", { locations: ["Pune"], organization: "Rubrik, Inc." }),
      rec("r3", { locations: ["Hyderabad"] }),
      rec("r4", { locations: ["Remote"], workMode: "remote" }),
      rec("r5", { locations: ["Bengaluru"], sourceId: "s-other-feed", sourceRecordId: "x9", title: "Senior AI Engineer – Enterprise Agentic Systems" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].locations.sort()).toEqual(["Bengaluru", "Hyderabad", "Pune", "Remote"]);
    expect(out[0].duplicateIds.sort()).toEqual(["r2", "r3", "r4", "r5"]);
  });

  it("keeps legitimately different openings separate", () => {
    const out = run([
      rec("a"),
      rec("b", { title: "Staff AI Engineer - Enterprise Agentic Systems" }), // different role
      rec("c", { description: "Own the Kubernetes platform and on-call rotation for storage clusters across regions." }), // same title, different job
      rec("d", { organization: "Acme AI" }), // same title at another employer
      rec("e", { title: "Product Designer", urls: ["https://boards.example.com/rubrik/a"] }), // shared URL, different title
    ]);
    expect(out.map((o) => o.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("the most trustworthy record represents the group; order follows the first record", () => {
    const out = run([rec("x", { title: "Other role", description: "different" }), rec("u1"), rec("v1", { verification: "org_verified", sourceId: null, sourceRecordId: null })]);
    expect(out.map((o) => o.id)).toEqual(["x", "v1"]);
    expect(out[1].duplicateIds).toEqual(["u1"]);
  });

  it("saves and dismissals on any record apply to the canonical opening", () => {
    const o = { id: "v1", duplicateIds: ["u1", "u2"] };
    expect(hasAnyId(new Set(["u2"]), o)).toBe(true);
    expect(recordIdIn(new Set(["u2"]), o)).toBe("u2"); // un-saving changes the record that was saved
    expect(recordIdIn(new Set(), o)).toBe("v1");
    expect(canonicalIdSet(new Set(["u1"]), [o]).has("v1")).toBe(true);
  });
});

describe("discovery pipeline on the database: unique counts, pages, field filter", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createMemoryDb();
    const now = new Date();
    const base = { category: "job" as const, workMode: "onsite" as const, status: "published" as const, publishedAt: now, country: "India" };
    const rows = [
      ...["Bengaluru", "Pune", "Hyderabad", "Chennai", "Gurugram"].map((city, i) => ({ ...base, slug: `rubrik-${i}`, title: RUBRIK_TITLE, organizationName: "Rubrik", description: RUBRIK_DESC, locations: [city], sourceRecordId: `rb-${i}`, publishedAt: new Date(now.getTime() - i * 1000) })),
      ...Array.from({ length: 14 }, (_, i) => ({ ...base, slug: `ml-${i}`, title: `Machine Learning Intern ${i}`, organizationName: `Lab ${i}`, description: `Train and evaluate models for project ${i} with its own team and dataset.`, locations: ["Pune"], publishedAt: new Date(now.getTime() - 10_000 - i * 1000) })),
      { ...base, slug: "ops", title: "Operations Executive", organizationName: "Logistix", description: "Coordinate shipments and maintain daily reports for the operations team.", locations: ["Delhi"] },
      { ...base, slug: "support", title: "Customer Support Executive", organizationName: "HelpCo", description: "Answer customer queries over chat and email in a friendly way.", locations: ["Delhi"] },
    ];
    const inserted = await db.insert(opportunities).values(rows).returning({ id: opportunities.id, slug: opportunities.slug });
    const skill = (slug: string) => inserted.find((r) => r.slug === slug)!.id;
    await db.insert(opportunitySkills).values([
      ...inserted.filter((r) => r.slug.startsWith("rubrik") || r.slug.startsWith("ml")).flatMap((r) => [
        { opportunityId: r.id, name: "Python", normalized: "python", required: true },
        { opportunityId: r.id, name: "Machine Learning", normalized: "machine learning", required: true },
      ]),
      { opportunityId: skill("ops"), name: "Excel", normalized: "excel", required: true },
      { opportunityId: skill("ops"), name: "Communication", normalized: "communication", required: true },
      { opportunityId: skill("support"), name: "Communication", normalized: "communication", required: true },
      { opportunityId: skill("support"), name: "Excel", normalized: "excel", required: false },
    ]);
  });

  it("counts unique openings, and no page repeats one", async () => {
    const q = searchSchema.parse({});
    const p1 = await searchOpportunities(db, q);
    const p2 = await searchOpportunities(db, { ...q, page: 2 });
    expect(p1.total).toBe(1 + 14 + 2); // 5 Rubrik records are one opening
    expect(p1.pageCount).toBe(Math.ceil(17 / PAGE_SIZE));
    const ids = [...p1.items, ...p2.items].map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(17);
    expect([...p1.items, ...p2.items].filter((o) => o.title === RUBRIK_TITLE)).toHaveLength(1);
    expect((await listOpenOpportunities(db)).filter((o) => o.title === RUBRIK_TITLE)).toHaveLength(1);
  });

  it("AI/ML field filter returns AI/ML openings only, once each, with an honest count", async () => {
    const q = searchSchema.parse({ field: "ai_ml" });
    const rules = discoveryRules(q);
    const res = await searchOpportunities(db, rules.dbQuery(q), new Date(), rules.keep);
    const all = [...res.items, ...(await searchOpportunities(db, { ...rules.dbQuery(q), page: 2 }, new Date(), rules.keep)).items];
    expect(res.total).toBe(15);
    expect(all).toHaveLength(15);
    expect(all.some((o) => o.title === "Operations Executive" || o.title === "Customer Support Executive")).toBe(false);
    expect(all.filter((o) => o.title === RUBRIK_TITLE)).toHaveLength(1);
  });

  it("Home and Opportunities recommendations are built from the same canonical set: no duplicate can come back", async () => {
    const open = await listOpenOpportunities(db);
    const rec = recommend((o) => ({ score: 50, completeness: 1, evidence: "none", factors: [], matchingSkills: [], missingRequiredSkills: [], missingPreferredSkills: [], reasons: [], nextActions: [], eligibility: { status: "eligible", checks: [], missingInformation: [] }, tier: o.title.includes("Agentic") ? "strong" : "good" }) as never, open.map((o) => ({ id: o.id, item: o, facts: toFacts(o) })), { limit: 10 });
    const titles = rec.picks.map((r) => `${r.item.title}|${r.item.organizationName}`);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.filter((t) => t.startsWith(RUBRIK_TITLE))).toHaveLength(1);
  });

  it("search finds by title, employer and skill, counting each opening once", async () => {
    for (const [q, n] of [["Agentic", 1], ["Rubrik", 1], ["python", 15], ["Logistix", 1]] as const) {
      expect((await searchOpportunities(db, searchSchema.parse({ q }))).total, q).toBe(n);
    }
  });
});

describe("same-opening rule edge cases", () => {
  const base = { sourceId: "s1", sourceRecordId: "1", urls: ["https://jobs.example.com/rubrik/101"], fingerprint: "f1", title: "Senior AI Engineer - Enterprise Agentic Systems", organization: "Rubrik", locations: ["Bengaluru"], workMode: "onsite", description: RUBRIK_DESC, deadline: null, employmentType: "full_time" };
  const other = (over: Record<string, unknown>) => ({ ...base, sourceId: "s2", sourceRecordId: "zz", fingerprint: "f2", urls: [], ...over });

  it("tracking parameters and different source ids don't hide a duplicate", () => {
    expect(sameOpening(base, other({ urls: ["https://jobs.example.com/rubrik/101/?utm_source=linkedin&gh_src=abc&ref=feed"] }))).toBe("url");
    expect(sameOpening(base, other({ locations: ["Pune"], description: `${RUBRIK_DESC} Location: Pune.` }))).toBe("same_role");
  });
  it("city suffixes in titles and empty descriptions don't hide a duplicate", () => {
    expect(roleTitle("Senior AI Engineer - Enterprise Agentic Systems (Pune)")).toBe(roleTitle(base.title));
    expect(roleTitle("Sr. AI Engineer – Enterprise Agentic Systems - Bengaluru, Remote")).toBe(roleTitle(base.title));
    expect(sameOpening({ ...base, description: "" }, other({ description: "", locations: ["Chennai"] }))).toBe("same_role");
  });
  it("different roles at the same employer stay distinct", () => {
    expect(roleTitle("Product Manager II - Ads")).not.toBe(roleTitle("Product Manager II"));
    expect(sameOpening({ ...base, title: "Product Manager II" }, other({ title: "Product Manager II - Ads" }))).toBeNull();
    expect(sameOpening(base, other({ urls: ["https://jobs.example.com/rubrik/101"], title: "Sales Development Representative" }))).toBeNull(); // shared careers URL
    expect(sameOpening(base, other({ employmentType: "internship" }))).toBeNull();
    expect(sameOpening(base, other({ description: "Own the Kubernetes platform, on-call rotation and capacity planning for storage clusters across regions worldwide." }))).toBeNull();
  });
});
