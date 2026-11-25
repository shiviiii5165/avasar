/**
 * Source record → normalized listing. Pure. Nothing is invented: a value the source doesn't give stays null.
 * Validation issues either reject the record (missing identity, unsafe links) or are kept as notes.
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import { normalizeSkill } from "../domain/skills";
import type { SkillRegistry } from "../intelligence/registry";
import { cleanLine, cleanText, htmlToText, injectionFlags } from "./sanitize";

export type OpportunityType = "job" | "internship" | "apprenticeship";

/** What an adapter returns per record. Every field except identity is optional and stays unknown when absent. */
export const rawListingSchema = z.object({
  sourceRecordId: z.string().min(1).max(200),
  title: z.string().max(1000),
  organization: z.string().max(1000),
  description: z.string().max(200_000).optional().nullable(),
  descriptionIsHtml: z.boolean().optional(),
  type: z.string().max(50).optional().nullable(),
  employmentType: z.string().max(50).optional().nullable(),
  locations: z.array(z.string().max(200)).max(30).optional().nullable(),
  workMode: z.string().max(30).optional().nullable(),
  requiredSkills: z.array(z.string().max(100)).max(60).optional().nullable(),
  preferredSkills: z.array(z.string().max(100)).max(60).optional().nullable(),
  /** Skills the source lists without saying whether they're required: stored as preferred, never as required. */
  skills: z.array(z.string().max(100)).max(60).optional().nullable(),
  experienceMinYears: z.number().int().min(0).max(50).optional().nullable(),
  experienceMaxYears: z.number().int().min(0).max(60).optional().nullable(),
  educationText: z.string().max(2000).optional().nullable(),
  eligibilityText: z.string().max(4000).optional().nullable(),
  compMin: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  compMax: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  compPeriod: z.enum(["year", "month", "project", "total"]).optional().nullable(),
  unpaid: z.boolean().optional().nullable(),
  deadline: z.string().max(40).optional().nullable(),
  postedAt: z.string().max(40).optional().nullable(),
  updatedAt: z.string().max(40).optional().nullable(),
  applyUrl: z.string().max(2000).optional().nullable(),
  sourceUrl: z.string().max(2000).optional().nullable(),
});
export type RawListing = z.infer<typeof rawListingSchema>;

export interface NormalizedListing {
  sourceRecordId: string;
  title: string;
  organization: string;
  description: string;
  type: OpportunityType;
  employmentType: "full_time" | "part_time" | "temporary" | "contract" | null;
  locations: string[];
  workMode: "remote" | "hybrid" | "onsite";
  /** True when the work mode was not stated and was read as on-site because locations are given. Shown in review. */
  workModeAssumed: boolean;
  skills: { name: string; normalized: string; required: boolean; origin: "listed" | "text_mentioned"; conceptId: string | null }[];
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  educationText: string | null;
  eligibilityText: string | null;
  compMin: number | null;
  compMax: number | null;
  compPeriod: "year" | "month" | "project" | "total" | null;
  unpaid: boolean;
  deadline: Date | null;
  postedAt: Date | null;
  sourceUpdatedAt: Date | null;
  applyUrl: string | null;
  sourceUrl: string | null;
  fingerprint: string;
  flags: string[];
  notes: string[];
}

export type NormalizeResult = { ok: true; listing: NormalizedListing } | { ok: false; issues: string[] };

const TRACKING = /^(utm_|fbclid$|gclid$|msclkid$|ref$|refid$|referrer$|source$|src$|trk$|trackingid$|mc_|gh_src$|lever-source|lever-origin$|_ga$|_gl$|ccuid$|li_fat_id$)/i;
/** https URL with tracking parameters, fragment and trailing slash removed; null when not a safe https URL. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username || u.password) return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    const s = u.toString();
    return s.endsWith("/") && u.pathname !== "/" ? s.slice(0, -1) : s;
  } catch {
    return null;
  }
}

const ORG_SUFFIX = /\b(private|pvt|limited|ltd|llp|inc|incorporated|corp|corporation|co|company)\b\.?/g;
export function normalizeEmployer(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(ORG_SUFFIX, " ").replace(/\s+/g, " ").trim();
}
export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\b(sr)\b\.?/g, "senior").replace(/\b(jr)\b\.?/g, "junior").replace(/[^a-z0-9+# ]+/g, " ").replace(/\s+/g, " ").trim();
}
export function normalizeLocation(l: string): string {
  const s = l.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  const CITY: Record<string, string> = { bombay: "mumbai", bangalore: "bengaluru", "new delhi": "delhi", gurgaon: "gurugram", calcutta: "kolkata", madras: "chennai", "navi mumbai": "navi mumbai" };
  return CITY[s] ?? s;
}

export function fingerprint(x: { title: string; organization: string; locations: string[]; description: string }): string {
  const desc = x.description.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return createHash("sha256").update([normalizeTitle(x.title), normalizeEmployer(x.organization), [...x.locations].map(normalizeLocation).sort().join(","), desc].join("|")).digest("hex").slice(0, 40);
}

/** ISO-like dates only ("2026-12-31", full ISO timestamps). Anything else is unknown, never guessed. */
export function parseDate(raw: string | null | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(raw.trim())) return null;
  const d = new Date(raw.trim().length === 10 ? `${raw.trim()}T23:59:59+05:30` : raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function typeOf(raw: RawListing, supported: readonly OpportunityType[]): OpportunityType | null {
  const t = (raw.type ?? "").toLowerCase();
  if (/apprentice/.test(t)) return "apprenticeship";
  if (/intern/.test(t)) return "internship";
  if (/job|full.?time|part.?time|employment|vacanc|contract/.test(t)) return "job";
  if (supported.length === 1) return supported[0];
  const title = raw.title.toLowerCase();
  if (/\bapprentice(ship)?\b/.test(title)) return "apprenticeship";
  if (/\bintern(ship)?\b/.test(title)) return "internship";
  return null;
}

function employmentOf(raw: string | null | undefined): NormalizedListing["employmentType"] {
  const t = (raw ?? "").toLowerCase();
  if (/full.?time/.test(t)) return "full_time";
  if (/part.?time/.test(t)) return "part_time";
  if (/contract|freelance/.test(t)) return "contract";
  if (/temporary|temp\b|seasonal/.test(t)) return "temporary";
  return null;
}

export function normalizeListing(rawIn: unknown, ctx: { supportedTypes: readonly OpportunityType[]; registry: SkillRegistry; now: Date }): NormalizeResult {
  const parsed = rawListingSchema.safeParse(rawIn);
  if (!parsed.success) return { ok: false, issues: [`Malformed record: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".") || i.message).join(", ")}`] };
  const raw = parsed.data;
  const issues: string[] = [];
  const notes: string[] = [];

  const title = cleanLine(raw.title, 140);
  const organization = cleanLine(raw.organization, 120);
  const description = raw.descriptionIsHtml ? htmlToText(raw.description ?? "", 10_000) : cleanText(raw.description ?? "", 10_000);
  if (title.length < 4) issues.push("Title missing or too short");
  if (organization.length < 2) issues.push("Employer missing");
  if (description.length < 40) issues.push("Description missing or too short (under 40 characters)");
  const type = typeOf(raw, ctx.supportedTypes);
  if (!type || !ctx.supportedTypes.includes(type)) issues.push("Opportunity type not stated or not supported by this source");

  const applyUrl = normalizeUrl(raw.applyUrl);
  const sourceUrl = normalizeUrl(raw.sourceUrl);
  if (raw.applyUrl && !applyUrl) issues.push("Application link is not a safe https link");
  if (raw.sourceUrl && !sourceUrl) issues.push("Source link is not a safe https link");
  if (!sourceUrl && !applyUrl) issues.push("No original source link");

  const locations = [...new Set((raw.locations ?? []).map((l) => cleanLine(l, 80)).filter(Boolean))].slice(0, 10);
  const modeText = `${raw.workMode ?? ""} ${locations.join(" ")}`.toLowerCase();
  let workMode: NormalizedListing["workMode"] | null = /remote|work from home|wfh/.test(modeText) ? "remote" : /hybrid/.test(modeText) ? "hybrid" : /on.?site|office|in.?person/.test(raw.workMode?.toLowerCase() ?? "") ? "onsite" : null;
  let workModeAssumed = false;
  if (!workMode && locations.length) {
    workMode = "onsite";
    workModeAssumed = true;
    notes.push("Work mode not stated; read as on-site because a location is given");
  }
  if (!workMode) issues.push("Neither work mode nor location stated");

  if (raw.compMin != null && raw.compMax != null && raw.compMax < raw.compMin) issues.push("Maximum pay is below minimum pay");
  if ((raw.compMin != null || raw.compMax != null) && !raw.compPeriod) notes.push("Pay period not stated; pay shown without a period");

  const deadline = parseDate(raw.deadline);
  if (raw.deadline && !deadline) notes.push("Deadline in an unreadable format; treated as not published");

  // Skills: required/preferred only as the source states them; unlabelled lists become preferred.
  const reg = ctx.registry;
  const skills: NormalizedListing["skills"] = [];
  const seen = new Set<string>();
  const push = (name: string, required: boolean, origin: "listed" | "text_mentioned") => {
    const n = cleanLine(name, 60);
    const normalized = normalizeSkill(n);
    const key = reg.key(n);
    if (!n || seen.has(key)) return;
    seen.add(key);
    skills.push({ name: origin === "text_mentioned" ? reg.displayName(key, n) : n, normalized, required: origin === "listed" && required, origin, conceptId: key.startsWith("text:") ? null : key });
  };
  for (const s of raw.requiredSkills ?? []) push(s, true, "listed");
  for (const s of raw.preferredSkills ?? []) push(s, false, "listed");
  for (const s of raw.skills ?? []) push(s, false, "listed");
  for (const id of reg.mentionedIn(`${title}\n${description}`)) push(reg.displayName(id, id), false, "text_mentioned");

  const flags = injectionFlags(title, organization, description, raw.eligibilityText ?? "", raw.educationText ?? "");

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    listing: {
      sourceRecordId: raw.sourceRecordId.trim(),
      title,
      organization,
      description,
      type: type!,
      employmentType: type === "job" ? employmentOf(raw.employmentType) : null,
      locations,
      workMode: workMode!,
      workModeAssumed,
      skills: skills.slice(0, 40),
      experienceMinYears: raw.experienceMinYears ?? null,
      experienceMaxYears: raw.experienceMaxYears ?? null,
      educationText: raw.educationText ? cleanText(raw.educationText, 1000) || null : null,
      eligibilityText: raw.eligibilityText ? cleanText(raw.eligibilityText, 2000) || null : null,
      compMin: raw.unpaid ? null : (raw.compMin ?? null),
      compMax: raw.unpaid ? null : (raw.compMax ?? null),
      compPeriod: raw.unpaid ? null : (raw.compPeriod ?? null),
      unpaid: raw.unpaid === true,
      deadline,
      postedAt: parseDate(raw.postedAt),
      sourceUpdatedAt: parseDate(raw.updatedAt),
      applyUrl,
      sourceUrl,
      fingerprint: fingerprint({ title, organization, locations, description }),
      flags,
      notes,
    },
  };
}
