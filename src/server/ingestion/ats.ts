/**
 * Employer job boards hosted on applicant-tracking systems, read through each platform's PUBLIC job-board API.
 * These APIs exist so employers can publish their own openings to other sites (documented by each vendor:
 * Greenhouse Job Board API, Lever Postings API, Ashby Job Postings API). No login, no key, one request per board.
 *
 * One source row per employer board: adapter key "<platform>:<board id>", e.g. "greenhouse:groww". The source's
 * name is the employer. Only openings located in India (or remote and open to India) are kept: Avsar serves
 * students in India, and a remote role with no stated country is left out rather than assumed to be open to them.
 */
import type { OpportunityType, RawListing } from "./normalize";
import type { CollectResult, SourceAdapter } from "./adapters";

const BOARD_ID = /^[A-Za-z0-9_.-]{2,80}$/;
const boardOf = (adapterKey: string | null | undefined) => {
  const id = (adapterKey ?? "").split(":")[1] ?? "";
  if (!BOARD_ID.test(id)) throw Object.assign(new Error("Board id missing or invalid in the source key"), { permanent: true });
  return id;
};

const INDIA = /\b(india|bharat|bengaluru|bangalore|mumbai|pune|hyderabad|gurugram|gurgaon|new delhi|delhi|noida|chennai|kolkata|ahmedabad|jaipur|kochi|cochin|coimbatore|chandigarh|indore|trivandrum|thiruvananthapuram|mysore|mysuru|nagpur|lucknow|bhubaneswar|vadodara|surat|goa|visakhapatnam|ncr)\b/i;
/** True when a location text says India, or "remote" together with India / APAC-India wording. */
export function inIndia(locations: string[], remoteFlag: boolean): boolean {
  const all = locations.join(" | ");
  if (INDIA.test(all)) return true;
  return remoteFlag && /\bindia\b/i.test(all);
}

const typeFrom = (title: string, commitment: string | null): OpportunityType => {
  const t = `${title} ${commitment ?? ""}`;
  if (/\bapprentice(ship)?\b/i.test(t)) return "apprenticeship";
  if (/\bintern(ship)?\b/i.test(t)) return "internship";
  return "job";
};
const iso = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
};
const indiaLocations = (locs: string[]) => locs.map((l) => l.trim()).filter((l) => INDIA.test(l));

function board(def: Omit<SourceAdapter, "authority" | "accessMethod" | "defaultFrequencyMinutes" | "rateLimit" | "config" | "termsNote" | "supportedTypes" | "collect"> & { collect: NonNullable<SourceAdapter["collect"]> }): SourceAdapter {
  return {
    ...def,
    authority: "employer",
    accessMethod: "employer_job_board_api",
    supportedTypes: ["job", "internship", "apprenticeship"],
    defaultFrequencyMinutes: 24 * 60,
    rateLimit: { requestsPerMinute: 10, maxRequestsPerRun: 1 },
    maxResponseBytes: 40_000_000, // large employers publish hundreds of full descriptions in one response
    config: [],
    termsNote: "The employer's own public job board, published through its applicant-tracking system's public job-board API for syndication. Record the employer and the board URL as evidence when approving.",
  };
}

// ─── Greenhouse ────────────────────────────────────────────────────────────
type GhJob = { id: number; title: string; absolute_url: string; location?: { name?: string }; offices?: { name?: string; location?: string }[]; updated_at?: string; first_published?: string; content?: string; metadata?: unknown };
export function greenhouseToRaw(j: GhJob, employer: string): RawListing | null {
  const locs = [j.location?.name ?? "", ...(j.offices ?? []).map((o) => o.location ?? o.name ?? "")].flatMap((l) => l.split(/[;|]/)).filter(Boolean);
  const remote = /remote/i.test(locs.join(" "));
  if (!inIndia(locs, remote)) return null;
  return {
    sourceRecordId: String(j.id),
    title: j.title,
    organization: employer,
    description: j.content ?? null, // entity-escaped HTML; htmlToText decodes and strips it
    descriptionIsHtml: true,
    type: typeFrom(j.title, null),
    locations: indiaLocations(locs).length ? indiaLocations(locs) : ["India"],
    workMode: remote ? "remote" : null,
    postedAt: iso(j.first_published) ?? null,
    updatedAt: iso(j.updated_at),
    applyUrl: j.absolute_url,
    sourceUrl: j.absolute_url,
  };
}

export const greenhouseAdapter = board({
  family: "greenhouse",
  name: "Greenhouse job boards",
  homepage: "https://boards.greenhouse.io/",
  mapping: "GET boards-api.greenhouse.io/v1/boards/<board>/jobs?content=true → title, location/offices, content (description), first_published, updated_at, absolute_url (apply + source). Pay, deadline and skills are not in this API and stay unknown.",
  allowedHosts: () => ["boards-api.greenhouse.io"],
  collect: async (ctx): Promise<CollectResult> => {
    const id = boardOf(ctx.adapterKey);
    const res = await ctx.get(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(id)}/jobs?content=true`);
    if (res.status !== 200) throw new Error(`Greenhouse answered HTTP ${res.status}`);
    const jobs = (JSON.parse(res.body) as { jobs?: GhJob[] }).jobs;
    if (!Array.isArray(jobs)) throw new Error("Unexpected Greenhouse response");
    return { records: jobs.slice(0, 3000).map((j) => greenhouseToRaw(j, ctx.sourceName ?? id)).filter(Boolean), complete: jobs.length <= 3000 };
  },
});

// ─── Lever ─────────────────────────────────────────────────────────────────
type LeverPosting = { id: string; text: string; hostedUrl: string; applyUrl?: string; createdAt?: number; workplaceType?: string; description?: string; descriptionPlain?: string; additional?: string; lists?: { text?: string; content?: string }[]; categories?: { location?: string; allLocations?: string[]; commitment?: string; team?: string } };
export function leverToRaw(p: LeverPosting, employer: string): RawListing | null {
  const locs = [...(p.categories?.allLocations ?? []), p.categories?.location ?? ""].filter(Boolean);
  const wt = (p.workplaceType ?? "").toLowerCase();
  const remote = wt === "remote" || /remote/i.test(locs.join(" "));
  if (!inIndia(locs, remote)) return null;
  const lists = (p.lists ?? []).map((l) => `<h3>${l.text ?? ""}</h3><ul>${l.content ?? ""}</ul>`).join("");
  return {
    sourceRecordId: p.id,
    title: p.text,
    organization: employer,
    description: `${p.description ?? p.descriptionPlain ?? ""}${lists}${p.additional ?? ""}`,
    descriptionIsHtml: true,
    type: typeFrom(p.text, p.categories?.commitment ?? null),
    employmentType: p.categories?.commitment ?? null,
    locations: indiaLocations(locs).length ? [...new Set(indiaLocations(locs))] : ["India"],
    workMode: wt === "remote" ? "remote" : wt === "hybrid" ? "hybrid" : wt === "on-site" || wt === "onsite" ? "onsite" : remote ? "remote" : null,
    postedAt: iso(p.createdAt),
    applyUrl: p.applyUrl ?? p.hostedUrl,
    sourceUrl: p.hostedUrl,
  };
}

export const leverAdapter = board({
  family: "lever",
  name: "Lever job boards",
  homepage: "https://jobs.lever.co/",
  mapping: "GET api.lever.co/v0/postings/<site>?mode=json → text (title), categories (location, commitment), workplaceType, description + lists (description), createdAt, hostedUrl / applyUrl. Pay, deadline and skills stay unknown.",
  allowedHosts: () => ["api.lever.co"],
  collect: async (ctx): Promise<CollectResult> => {
    const id = boardOf(ctx.adapterKey);
    const res = await ctx.get(`https://api.lever.co/v0/postings/${encodeURIComponent(id)}?mode=json`);
    if (res.status !== 200) throw new Error(`Lever answered HTTP ${res.status}`);
    const posts = JSON.parse(res.body) as LeverPosting[];
    if (!Array.isArray(posts)) throw new Error("Unexpected Lever response");
    return { records: posts.slice(0, 3000).map((p) => leverToRaw(p, ctx.sourceName ?? id)).filter(Boolean), complete: posts.length <= 3000 };
  },
});

// ─── Ashby ─────────────────────────────────────────────────────────────────
type AshbyJob = { id: string; title: string; location?: string; secondaryLocations?: { location?: string }[]; employmentType?: string; isRemote?: boolean; workplaceType?: string; descriptionHtml?: string; descriptionPlain?: string; publishedAt?: string; jobUrl?: string; applyUrl?: string; isListed?: boolean };
export function ashbyToRaw(j: AshbyJob, employer: string): RawListing | null {
  if (j.isListed === false) return null;
  const locs = [j.location ?? "", ...(j.secondaryLocations ?? []).map((l) => l.location ?? "")].filter(Boolean);
  const wt = (j.workplaceType ?? "").toLowerCase();
  const remote = j.isRemote === true || wt === "remote";
  if (!inIndia(locs, remote)) return null;
  const et = (j.employmentType ?? "").toLowerCase();
  return {
    sourceRecordId: j.id,
    title: j.title,
    organization: employer,
    description: j.descriptionHtml ?? j.descriptionPlain ?? null,
    descriptionIsHtml: Boolean(j.descriptionHtml),
    type: et === "intern" ? "internship" : typeFrom(j.title, null),
    employmentType: et === "fulltime" ? "full_time" : et === "parttime" ? "part_time" : et === "contract" ? "contract" : et === "temporary" ? "temporary" : null,
    locations: indiaLocations(locs).length ? [...new Set(indiaLocations(locs))] : ["India"],
    workMode: remote ? "remote" : wt === "hybrid" ? "hybrid" : wt === "onsite" || wt === "on-site" ? "onsite" : null,
    postedAt: iso(j.publishedAt),
    applyUrl: j.applyUrl ?? j.jobUrl ?? null,
    sourceUrl: j.jobUrl ?? j.applyUrl ?? null,
  };
}

export const ashbyAdapter = board({
  family: "ashby",
  name: "Ashby job boards",
  homepage: "https://jobs.ashbyhq.com/",
  mapping: "GET api.ashbyhq.com/posting-api/job-board/<board> → title, location + secondaryLocations, employmentType, isRemote/workplaceType, descriptionHtml, publishedAt, jobUrl/applyUrl. Pay, deadline and skills stay unknown.",
  allowedHosts: () => ["api.ashbyhq.com"],
  collect: async (ctx): Promise<CollectResult> => {
    const id = boardOf(ctx.adapterKey);
    const res = await ctx.get(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(id)}`);
    if (res.status !== 200) throw new Error(`Ashby answered HTTP ${res.status}`);
    const jobs = (JSON.parse(res.body) as { jobs?: AshbyJob[] }).jobs;
    if (!Array.isArray(jobs)) throw new Error("Unexpected Ashby response");
    return { records: jobs.slice(0, 3000).map((j) => ashbyToRaw(j, ctx.sourceName ?? id)).filter(Boolean), complete: jobs.length <= 3000 };
  },
});

export const ATS_ADAPTERS: SourceAdapter[] = [greenhouseAdapter, leverAdapter, ashbyAdapter];

/** Public job-board page shown to admins and students for each platform. */
export function boardPageUrl(family: string, id: string): string | null {
  if (!BOARD_ID.test(id)) return null;
  if (family === "greenhouse") return `https://boards.greenhouse.io/${id}`;
  if (family === "lever") return `https://jobs.lever.co/${id}`;
  if (family === "ashby") return `https://jobs.ashbyhq.com/${id}`;
  return null;
}

/**
 * Employer boards verified live on 2026-11-24 to carry openings in India. Registered as UNREVIEWED and switched
 * off: an admin records the permission and switches each one on. Names are the employers.
 */
export const KNOWN_BOARDS: { family: "greenhouse" | "lever" | "ashby"; id: string; employer: string }[] = [
  { family: "greenhouse", id: "razorpaysoftwareprivatelimited", employer: "Razorpay" },
  { family: "greenhouse", id: "groww", employer: "Groww" },
  { family: "greenhouse", id: "inmobi", employer: "InMobi" },
  { family: "greenhouse", id: "druva", employer: "Druva" },
  { family: "greenhouse", id: "hackerrank", employer: "HackerRank" },
  { family: "greenhouse", id: "rubrik", employer: "Rubrik" },
  { family: "greenhouse", id: "databricks", employer: "Databricks" },
  { family: "greenhouse", id: "stripe", employer: "Stripe" },
  { family: "lever", id: "cred", employer: "CRED" },
  { family: "lever", id: "meesho", employer: "Meesho" },
  { family: "lever", id: "paytm", employer: "Paytm" },
  { family: "lever", id: "mindtickle", employer: "Mindtickle" },
  { family: "ashby", id: "atlan", employer: "Atlan" },
  { family: "ashby", id: "sarvam", employer: "Sarvam AI" },
];
