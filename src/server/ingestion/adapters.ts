/**
 * Source adapters. Each one declares how it may be accessed, what it needs and how its data maps; none of them
 * touches the database or the UI (the pipeline in services/ingestion.ts does). An adapter can only run when its
 * source row is `approved_collection` (set by a person, with evidence) AND its configuration is complete.
 *
 * What is NOT here, on purpose: login automation, CAPTCHA solving, proxy rotation, stealth browsers, or any
 * way around a site's access controls, rate limits or terms. A source that does not permit automated collection
 * is link-only: Avsar may point students to it, or carry listings employers submit themselves.
 */
import type { OpportunityType, RawListing } from "./normalize";
import { robotsAllows, safeFetch, type SafeFetchOptions, type SafeResponse } from "./safe-fetch";

export type AccessMethod = "authorized_feed" | "employer_structured_data" | "link_only";

export interface ConfigVar { env: string; required: boolean; secret: boolean; description: string }

export interface CollectContext {
  /** The source row's URL (employer careers page). */
  sourceUrl: string | null;
  env: Record<string, string | undefined>;
  /** SSRF-safe GET, already bound to this adapter's allow-list and request budget. */
  get: (url: string, headers?: Record<string, string>) => Promise<SafeResponse>;
}

export interface CollectResult {
  records: unknown[];
  /** True when the run saw the source's whole current list, so records not seen can be marked missing. */
  complete: boolean;
}

export interface SourceAdapter {
  family: string;
  name: string;
  homepage: string;
  authority: "official" | "employer" | "third_party";
  accessMethod: AccessMethod;
  supportedTypes: OpportunityType[];
  defaultFrequencyMinutes: number;
  rateLimit: { requestsPerMinute: number; maxRequestsPerRun: number };
  config: ConfigVar[];
  /** Human-readable mapping and access notes shown in the Source Manager. */
  mapping: string;
  termsNote: string;
  allowedHosts: (ctx: { sourceUrl: string | null; env: Record<string, string | undefined> }) => string[];
  collect?: (ctx: CollectContext) => Promise<CollectResult>;
}

export class SourceNotPermittedError extends Error {
  readonly permanent = true;
}
export class SourceConfigError extends Error {
  readonly permanent = true;
}

// ─── Authorized feeds (AICTE, NCS, NATS) ───────────────────────────────────
/**
 * The feed format Avsar accepts from an authorized partner feed or an approved Apify Actor dataset:
 * a JSON array (or { items: [...] }) of RawListing objects (see normalize.ts rawListingSchema).
 * A portal's own export format is mapped to RawListing by the partner integration or the Actor, once that
 * format is known from the data-sharing agreement; nothing here guesses at an undocumented private API.
 */
const APIFY_HOST = "api.apify.com";
const hostOf = (u: string | undefined | null) => {
  try {
    return u ? new URL(u).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
};

function feedAdapter(def: { family: string; name: string; homepage: string; envPrefix: string; types: OpportunityType[]; terms: string }): SourceAdapter {
  const feedVar = `${def.envPrefix}_FEED_URL`;
  const tokenVar = `${def.envPrefix}_FEED_TOKEN`;
  const datasetVar = `${def.envPrefix}_APIFY_DATASET`;
  return {
    family: def.family,
    name: def.name,
    homepage: def.homepage,
    authority: "official",
    accessMethod: "authorized_feed",
    supportedTypes: def.types,
    defaultFrequencyMinutes: 12 * 60,
    rateLimit: { requestsPerMinute: 6, maxRequestsPerRun: 20 },
    config: [
      { env: feedVar, required: false, secret: false, description: "https URL of the authorized feed (JSON, Avsar feed format). Set this OR the Apify dataset." },
      { env: tokenVar, required: false, secret: true, description: "Bearer token for the feed, if the partner issues one." },
      { env: datasetVar, required: false, secret: false, description: "Dataset id of an approved Apify Actor run that produces the Avsar feed format." },
      { env: "AVSAR_APIFY_TOKEN", required: false, secret: true, description: "Apify API token (only with the dataset option)." },
    ],
    mapping: "Reads RawListing records (title, organization, description, type, locations, skills, deadline, applyUrl, sourceUrl, ...). Unknown fields stay unknown. Unlabelled skill lists are stored as preferred, never required.",
    termsNote: def.terms,
    allowedHosts: ({ env }) => [hostOf(env[feedVar]), env[datasetVar] ? APIFY_HOST : null].filter((h): h is string => Boolean(h)),
    collect: async (ctx) => {
      const feed = ctx.env[feedVar];
      const dataset = ctx.env[datasetVar];
      let res: SafeResponse;
      if (feed) {
        res = await ctx.get(feed, ctx.env[tokenVar] ? { authorization: `Bearer ${ctx.env[tokenVar]}` } : {});
      } else if (dataset) {
        if (!/^[A-Za-z0-9~_-]{1,64}$/.test(dataset)) throw new SourceConfigError(`${datasetVar} is not a valid dataset id`);
        if (!ctx.env.AVSAR_APIFY_TOKEN) throw new SourceConfigError("AVSAR_APIFY_TOKEN is required with an Apify dataset");
        // Token in a header, never in the URL (URLs end up in logs).
        res = await ctx.get(`https://${APIFY_HOST}/v2/datasets/${dataset}/items?clean=true&format=json`, { authorization: `Bearer ${ctx.env.AVSAR_APIFY_TOKEN}` });
      } else throw new SourceConfigError(`Set ${feedVar} or ${datasetVar}`);
      if (res.status !== 200) throw new Error(`Feed answered HTTP ${res.status}`);
      if (!res.contentType.includes("json")) throw new Error("Feed did not return JSON");
      const data = JSON.parse(res.body) as unknown;
      const records = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown })?.items) ? (data as { items: unknown[] }).items : null;
      if (!records) throw new Error("Feed is not a list of records");
      return { records: records.slice(0, 5000), complete: records.length <= 5000 };
    },
  };
}

const GOV_TERMS = "Government portal. No public, documented bulk API has been verified for automated collection. Collection needs a written data-sharing arrangement or an officially published feed; until then this source is link-only. Do not scrape pages behind login or CAPTCHA.";

export const aicteAdapter = feedAdapter({ family: "aicte_internship", name: "AICTE National Internship Portal", homepage: "https://internship.aicte-india.org/", envPrefix: "AVSAR_SRC_AICTE", types: ["internship"], terms: GOV_TERMS });
export const ncsAdapter = feedAdapter({ family: "ncs", name: "National Career Service (NCS)", homepage: "https://www.ncs.gov.in/", envPrefix: "AVSAR_SRC_NCS", types: ["job", "internship", "apprenticeship"], terms: GOV_TERMS });
export const natsAdapter = feedAdapter({ family: "nats", name: "NATS 2.0 (National Apprenticeship Training Scheme)", homepage: "https://nats.education.gov.in/", envPrefix: "AVSAR_SRC_NATS", types: ["apprenticeship"], terms: GOV_TERMS });

// ─── Third-party: Naukri (link-only) ───────────────────────────────────────
export const naukriAdapter: SourceAdapter = {
  family: "naukri",
  name: "Naukri.com",
  homepage: "https://www.naukri.com/",
  authority: "third_party",
  accessMethod: "link_only",
  supportedTypes: ["job", "internship"],
  defaultFrequencyMinutes: 0,
  rateLimit: { requestsPerMinute: 0, maxRequestsPerRun: 0 },
  config: [],
  mapping: "No collection. Students may be linked to Naukri; employers can submit their own listings to Avsar directly.",
  termsNote: "Third-party job board. No authorized API or partnership exists for Avsar; automated collection is treated as not permitted. A listing seen here is never treated as a verified employer or vacancy.",
  allowedHosts: () => [],
  // Deliberately no collect(): the pipeline refuses to run a link-only source whatever its permission status.
};

// ─── Employer's own careers site (schema.org JobPosting) ───────────────────
type Ld = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** Extracts schema.org JobPosting objects from JSON-LD blocks. Malformed blocks are skipped. */
export function extractJobPostings(html: string): Ld[] {
  const out: Ld[] = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.slice(0, 5_000_000).matchAll(re)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const walk = (x: unknown, depth: number) => {
      if (depth > 4 || !x || typeof x !== "object") return;
      if (Array.isArray(x)) return x.slice(0, 500).forEach((y) => walk(y, depth + 1));
      const o = x as Ld;
      if (list(o["@type"]).includes("JobPosting")) out.push(o);
      if (o["@graph"]) walk(o["@graph"], depth + 1);
      if (o.itemListElement) walk(list(o.itemListElement).map((i) => (i as Ld)?.item ?? i), depth + 1);
    };
    walk(data, 0);
  }
  return out.slice(0, 1000);
}

/** JobPosting → RawListing, field by field. Values JobPosting doesn't carry stay unknown. */
export function jobPostingToRaw(p: Ld, pageUrl: string): RawListing | null {
  const title = str(p.title);
  const org = str((p.hiringOrganization as Ld | undefined)?.name) ?? (typeof p.hiringOrganization === "string" ? p.hiringOrganization : null);
  if (!title || !org) return null;
  const id = str((p.identifier as Ld | undefined)?.value) ?? str(p.identifier) ?? str(p.url) ?? `${title}|${str(p.datePosted) ?? ""}`;
  const emp = list(p.employmentType).map(String).join(" ").toUpperCase();
  const remote = str(p.jobLocationType)?.toUpperCase() === "TELECOMMUTE";
  const locations = list(p.jobLocation)
    .map((l) => (l as Ld)?.address as Ld | undefined)
    .map((a) => (a ? str(a.addressLocality) ?? str(a.addressRegion) : null))
    .filter((x): x is string => Boolean(x));
  const salary = p.baseSalary as Ld | undefined;
  const sv = salary?.value as Ld | undefined;
  const unit = str(sv?.unitText)?.toUpperCase();
  const period = unit === "YEAR" ? "year" : unit === "MONTH" ? "month" : null;
  const inr = !salary || !str(salary.currency) || str(salary.currency)!.toUpperCase() === "INR";
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Math.round(Number(v)) : null);
  const months = num((p.experienceRequirements as Ld | undefined)?.monthsOfExperience);
  const edu = p.educationRequirements;
  return {
    sourceRecordId: id.slice(0, 200),
    title,
    organization: org,
    description: str(p.description),
    descriptionIsHtml: true,
    type: emp.includes("INTERN") ? "internship" : /apprentice/i.test(title) ? "apprenticeship" : emp ? "job" : null,
    employmentType: emp.includes("FULL_TIME") ? "full_time" : emp.includes("PART_TIME") ? "part_time" : emp.includes("CONTRACTOR") ? "contract" : emp.includes("TEMPORARY") ? "temporary" : null,
    locations,
    workMode: remote ? "remote" : null,
    skills: list(p.skills).flatMap((s) => (typeof s === "string" ? s.split(/[,;]/) : [])).map((s) => s.trim()).filter(Boolean).slice(0, 40),
    experienceMinYears: months !== null ? Math.floor(months / 12) : null,
    educationText: typeof edu === "string" ? edu : str((edu as Ld | undefined)?.credentialCategory),
    // Pay only when stated in INR with a period; never converted or estimated.
    compMin: inr && period ? num(sv?.minValue) ?? num(sv?.value) : null,
    compMax: inr && period ? num(sv?.maxValue) ?? num(sv?.value) : null,
    compPeriod: inr && period ? period : null,
    deadline: str(p.validThrough)?.slice(0, 25) ?? null,
    postedAt: str(p.datePosted)?.slice(0, 25) ?? null,
    applyUrl: str(p.url),
    sourceUrl: str(p.url) ?? pageUrl,
  };
}

export const employerCareersAdapter: SourceAdapter = {
  family: "employer_careers",
  name: "Employer careers site",
  homepage: "",
  authority: "employer",
  accessMethod: "employer_structured_data",
  supportedTypes: ["job", "internship", "apprenticeship"],
  defaultFrequencyMinutes: 24 * 60,
  rateLimit: { requestsPerMinute: 2, maxRequestsPerRun: 2 },
  config: [],
  mapping: "Reads schema.org JobPosting structured data (JSON-LD) from the one careers page recorded on the source, after checking robots.txt. Title, employer, description, employment type, locations, remote flag, skills, experience (months → years), education text, INR pay with a stated period, validThrough (deadline), datePosted and the posting URL.",
  termsNote: "Employer's own site. Collect only with the employer's permission (or where their terms and robots.txt allow it), one page, at most twice a day.",
  allowedHosts: ({ sourceUrl }) => [hostOf(sourceUrl)].filter((h): h is string => Boolean(h)),
  collect: async (ctx) => {
    if (!ctx.sourceUrl) throw new SourceConfigError("The source needs the careers page URL");
    const page = new URL(ctx.sourceUrl);
    const robots = await ctx.get(`https://${page.hostname}/robots.txt`).catch(() => null);
    if (robots && robots.status === 200 && !robotsAllows(robots.body, page.pathname)) throw new SourceNotPermittedError(`robots.txt disallows ${page.pathname}`);
    const res = await ctx.get(page.toString());
    if (res.status !== 200) throw new Error(`Careers page answered HTTP ${res.status}`);
    const records = extractJobPostings(res.body).map((p) => jobPostingToRaw(p, page.toString())).filter(Boolean);
    return { records, complete: true };
  },
};

export const ADAPTERS: SourceAdapter[] = [aicteAdapter, ncsAdapter, natsAdapter, naukriAdapter, employerCareersAdapter];

/** "employer_careers:<host>" rows share the employer_careers adapter; every other key names its adapter exactly. */
export function adapterFor(adapterKey: string | null): SourceAdapter | null {
  if (!adapterKey) return null;
  const family = adapterKey.split(":")[0];
  return ADAPTERS.find((a) => a.family === family) ?? null;
}

/** Required configuration that is missing (names only; values never leave the server). */
export function missingConfig(a: SourceAdapter, env: Record<string, string | undefined>, sourceUrl: string | null): string[] {
  if (a.accessMethod === "authorized_feed") {
    const prefix = a.config[0]?.env.replace(/_FEED_URL$/, "");
    const hasFeed = Boolean(env[`${prefix}_FEED_URL`]);
    const hasDataset = Boolean(env[`${prefix}_APIFY_DATASET`]) && Boolean(env.AVSAR_APIFY_TOKEN);
    return hasFeed || hasDataset ? [] : [`${prefix}_FEED_URL or ${prefix}_APIFY_DATASET + AVSAR_APIFY_TOKEN`];
  }
  if (a.accessMethod === "employer_structured_data") return sourceUrl ? [] : ["careers page URL on the source"];
  return a.config.filter((c) => c.required && !env[c.env]).map((c) => c.env);
}

/** Binds safeFetch to an adapter's allow-list and per-run request budget, with spacing between requests. */
export function boundGetter(a: SourceAdapter, allowedHosts: string[], deps: Parameters<typeof safeFetch>[2] = {}, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  let used = 0;
  let last = 0;
  const gap = a.rateLimit.requestsPerMinute > 0 ? Math.ceil(60_000 / a.rateLimit.requestsPerMinute) : Infinity;
  return async (url: string, headers: Record<string, string> = {}) => {
    if (used >= a.rateLimit.maxRequestsPerRun) throw new Error(`Request budget for this run (${a.rateLimit.maxRequestsPerRun}) used up`);
    const wait = last ? last + gap - Date.now() : 0;
    if (wait > 0 && Number.isFinite(wait)) await sleep(wait);
    used++;
    last = Date.now();
    const opts: SafeFetchOptions = { allowedHosts, headers };
    return safeFetch(url, opts, deps);
  };
}
