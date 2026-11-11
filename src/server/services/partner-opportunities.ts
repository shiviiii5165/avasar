import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "../db/client";
import { opportunities } from "../db/schema";
import { detailColumns, fromDetailRow, publicVisibility, type OpportunityFull } from "./opportunities";

/**
 * The partner view of Avsar internships (contract: PartnerInternshipV1).
 *
 * Only what any visitor may already see on Avsar's public listing page: published, deadline not passed
 * (the same publicVisibility rule as the marketplace), category internship, never sample/demo listings.
 * Drafts, in-review, paused, closed, expired, rejected and suspended listings are never returned.
 * Avsar has no per-candidate visibility restriction for published listings (eligibility is advisory and
 * checked again by Avsar when someone applies), so no student identity is needed or sent.
 *
 * Never returned: internal notes, questions, organisation members, employer ids, import payloads,
 * applications, source/provider bookkeeping, version history.
 */
export const partnerQuery = z.object({
  page: z.coerce.number().int().min(1).max(200).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
  workMode: z.enum(["remote", "hybrid", "onsite"]).optional(),
});
export type PartnerQuery = z.infer<typeof partnerQuery>;

export interface PartnerInternshipV1 {
  id: string;
  slug: string;
  title: string;
  organization: string;
  summary: string | null;
  description: string;
  requiredSkills: string[];
  preferredSkills: string[];
  eligibility: {
    educationLevels: string[] | null;
    graduationYearMin: number | null;
    graduationYearMax: number | null;
    minExperienceYears: number | null;
    requiredCertifications: string[] | null;
    allowedLocations: string[] | null;
    requiresWorkAuthorizationIndia: boolean;
    notes: string | null;
  } | null;
  locations: string[];
  country: string;
  workMode: "remote" | "hybrid" | "onsite";
  /** Present only when the listing states compensation; unpaid listings say so explicitly. */
  stipend: { min: number | null; max: number | null; currency: string; period: string | null; note: string | null } | null;
  unpaid: boolean;
  durationWeeks: number | null;
  startDate: string | null;
  publishedAt: string | null;
  deadline: string | null;
  updatedAt: string;
  status: "published";
  verification: "unverified" | "source_verified" | "org_verified";
  applicationMethod: "internal" | "external";
  /** Avsar's public listing page. */
  url: string;
  /** Where to start an application: Avsar's own apply page (Avsar handles sign-in and eligibility). */
  applyUrl: string;
}

function stipendOf(o: OpportunityFull): PartnerInternshipV1["stipend"] {
  const note = typeof o.details?.stipendNote === "string" && o.details.stipendNote.trim() ? o.details.stipendNote.trim() : null;
  if (o.unpaid) return null;
  if (o.compMin === null && o.compMax === null && !note) return null;
  return { min: o.compMin, max: o.compMax, currency: o.compCurrency, period: o.compPeriod, note };
}

export function toPartnerInternship(o: OpportunityFull, origin: string): PartnerInternshipV1 {
  const e = o.eligibility;
  const detail = `${origin}/opportunities/${encodeURIComponent(o.slug)}`;
  return {
    id: o.id,
    slug: o.slug,
    title: o.title,
    organization: o.organizationName,
    summary: o.summary,
    description: o.description,
    requiredSkills: o.skills.filter((s) => s.required).map((s) => s.name),
    preferredSkills: o.skills.filter((s) => !s.required).map((s) => s.name),
    eligibility: e
      ? {
          educationLevels: e.educationLevels ?? null,
          graduationYearMin: e.graduationYearMin,
          graduationYearMax: e.graduationYearMax,
          minExperienceYears: e.minExperienceYears,
          requiredCertifications: e.requiredCertifications ?? null,
          allowedLocations: e.allowedLocations ?? null,
          requiresWorkAuthorizationIndia: e.requiresWorkAuthorizationIndia,
          notes: e.notes,
        }
      : null,
    locations: o.locations,
    country: o.country,
    workMode: o.workMode,
    stipend: stipendOf(o),
    unpaid: o.unpaid,
    durationWeeks: o.durationWeeks,
    startDate: o.startDate ? String(o.startDate) : null,
    publishedAt: o.publishedAt ? new Date(o.publishedAt).toISOString() : null,
    deadline: o.deadline ? new Date(o.deadline).toISOString() : null,
    updatedAt: new Date(o.updatedAt).toISOString(),
    status: "published",
    verification: o.verification,
    applicationMethod: o.applicationMethod,
    url: detail,
    // External listings: Avsar's own detail page holds the employer's link (Avsar's apply page redirects there too).
    applyUrl: o.applicationMethod === "internal" ? `${origin}/app/apply/${encodeURIComponent(o.slug)}` : detail,
  };
}

export async function listPartnerInternships(db: Db, q: PartnerQuery, origin: string, now = new Date()) {
  const where = and(
    publicVisibility(now),
    eq(opportunities.category, "internship"),
    eq(opportunities.isSample, false),
    q.workMode ? eq(opportunities.workMode, q.workMode) : undefined,
  )!;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ o: opportunities, ...detailColumns })
      .from(opportunities)
      .where(where)
      // Stable order (newest published first, id as tie-break) so pages never overlap or skip.
      .orderBy(desc(opportunities.publishedAt), asc(opportunities.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(opportunities).where(where),
  ]);
  return {
    schema: "PartnerInternshipV1" as const,
    generatedAt: now.toISOString(),
    page: q.page,
    pageSize: q.pageSize,
    total,
    hasMore: q.page * q.pageSize < total,
    items: rows.map(fromDetailRow).map((o) => toPartnerInternship(o, origin)),
  };
}
