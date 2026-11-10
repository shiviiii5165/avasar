import { CATEGORY_KEYS, mergeQuestions, type CategoryKey } from "../domain/categories";
import "server-only";

import { createHash } from "node:crypto";

import { and, asc, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { audit } from "../audit";
import type { Db } from "../db/client";
import { importRecords, opportunities, opportunityEligibility, opportunitySkills, opportunitySources, opportunityVersions } from "../db/schema";
import { normalizeSkill, parseSkillList } from "../domain/skills";
import type { EducationLevel, OpportunityFacts } from "../domain/types";
import { canTransitionOpportunity, publishProblems, type OpportunityStatus } from "../domain/workflows";

export type OpportunityRow = typeof opportunities.$inferSelect;
export type EligibilityRow = typeof opportunityEligibility.$inferSelect;
export interface OpportunityFull extends OpportunityRow {
  skills: { name: string; normalized: string; required: boolean }[];
  eligibility: EligibilityRow | null;
}

// ─── Public discovery ──────────────────────────────────────────────────────
export const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORY_KEYS).optional(),
  workMode: z.enum(["remote", "hybrid", "onsite"]).optional(),
  location: z.string().trim().max(60).optional(),
  employmentType: z.enum(["full_time", "part_time", "temporary", "contract"]).optional(),
  minComp: z.coerce.number().int().min(0).max(100_000_000).optional(),
  maxExperience: z.coerce.number().int().min(0).max(40).optional(),
  verified: z.enum(["1"]).optional(),
  paid: z.enum(["1"]).optional(),
  closingWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  sort: z.enum(["relevance", "newest", "deadline"]).default("newest"),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
export type SearchInput = z.infer<typeof searchSchema>;
export const PAGE_SIZE = 12;

/** Only published listings whose deadline hasn't passed are ever returned to the public. */
export function publicVisibility(now = new Date()): SQL {
  return and(eq(opportunities.status, "published"), or(isNull(opportunities.deadline), gt(opportunities.deadline, now)))!;
}

/** WHERE clause shared by the paginated search and the personalized (ranked) search, so both filter identically. */
function searchFilter(db: Db, input: SearchInput, now: Date) {
  const where: SQL[] = [publicVisibility(now)];
  if (input.q) {
    const term = `%${input.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const skillHit = db.select({ id: opportunitySkills.opportunityId }).from(opportunitySkills).where(ilike(opportunitySkills.name, term));
    where.push(or(ilike(opportunities.title, term), ilike(opportunities.organizationName, term), ilike(opportunities.summary, term), inArray(opportunities.id, skillHit))!);
  }
  if (input.category) where.push(eq(opportunities.category, input.category));
  if (input.workMode) where.push(eq(opportunities.workMode, input.workMode));
  if (input.employmentType) where.push(eq(opportunities.employmentType, input.employmentType));
  if (input.location) where.push(sql`exists (select 1 from unnest(${opportunities.locations}) l where l ilike ${`%${input.location}%`})`);
  if (input.minComp !== undefined) where.push(sql`coalesce(${opportunities.compMax}, ${opportunities.compMin}) >= ${input.minComp}`);
  if (input.maxExperience !== undefined) where.push(sql`coalesce(${opportunities.experienceMinYears}, 0) <= ${input.maxExperience}`);
  if (input.verified) where.push(inArray(opportunities.verification, ["source_verified", "org_verified"]));
  if (input.paid) where.push(eq(opportunities.unpaid, false));
  if (input.closingWithinDays) where.push(sql`${opportunities.deadline} <= ${new Date(now.getTime() + input.closingWithinDays * 86_400_000)}`);
  return and(...where)!;
}

export async function searchOpportunities(db: Db, input: SearchInput, now = new Date()) {
  const order =
    input.sort === "deadline" ? [sql`${opportunities.deadline} asc nulls last`, asc(opportunities.id)] : [desc(opportunities.publishedAt), asc(opportunities.id)];
  const filter = searchFilter(db, input, now);
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(opportunities).where(filter).orderBy(...order).limit(PAGE_SIZE).offset((input.page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(opportunities).where(filter),
  ]);
  return { items: await withDetails(db, rows), total, page: input.page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Upper bound on listings ranked per request (server memory only; the page sent to the browser is PAGE_SIZE). */
export const RANK_LIMIT = 500;

/**
 * "Best match" search: the same filters as searchOpportunities, but the WHOLE filtered set (up to RANK_LIMIT,
 * newest first) is ranked with `rank` before paging, so a strong match on what would be page 2 by date
 * still comes first. Matching runs in TypeScript (eligibility rules, skills, education), so it can't be a
 * SQL ORDER BY; ranking is done on the server and only one page leaves it.
 */
export async function searchOpportunitiesRanked(db: Db, input: SearchInput, rank: (items: OpportunityFull[]) => OpportunityFull[] | Promise<OpportunityFull[]>, now = new Date()) {
  const filter = searchFilter(db, input, now);
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(opportunities).where(filter).orderBy(desc(opportunities.publishedAt), asc(opportunities.id)).limit(RANK_LIMIT),
    db.select({ total: sql<number>`count(*)::int` }).from(opportunities).where(filter),
  ]);
  // `rank` may await data loaded in parallel (e.g. the candidate's profile), so the search never waits for it to start.
  const ranked = await rank(await withDetails(db, rows));
  const start = (input.page - 1) * PAGE_SIZE;
  const ranks = Math.min(total, RANK_LIMIT);
  return { items: ranked.slice(start, start + PAGE_SIZE), total, page: input.page, pageCount: Math.max(1, Math.ceil(ranks / PAGE_SIZE)), truncated: total > RANK_LIMIT };
}

/**
 * One page of an already-ranked, COMPLETE list, shaped like searchOpportunitiesRanked's result. Used when the
 * unfiltered search would return exactly the open listings the page has already loaded, so they aren't fetched twice.
 */
export function rankedPage(ranked: OpportunityFull[], page: number) {
  const start = (page - 1) * PAGE_SIZE;
  return { items: ranked.slice(start, start + PAGE_SIZE), total: ranked.length, page, pageCount: Math.max(1, Math.ceil(ranked.length / PAGE_SIZE)), truncated: false };
}

/** All open listings (bounded) for personalized ranking; the public marketplace keeps its own pagination. */
/** Categories that currently have publicly visible listings, in registry order. Empty categories aren't shown. */
export async function liveCategories(db: Db, now = new Date()): Promise<CategoryKey[]> {
  const rows = await db.selectDistinct({ c: opportunities.category }).from(opportunities).where(publicVisibility(now));
  const have = new Set(rows.map((r) => r.c as string));
  return CATEGORY_KEYS.filter((k) => have.has(k));
}

export async function listOpenOpportunities(db: Db, limit = 300, now = new Date()) {
  // Same order as the search (newest first, id as tie-break), so a ranked list built from these rows is identical.
  const rows = await db.select({ o: opportunities, ...detailColumns }).from(opportunities).where(publicVisibility(now)).orderBy(desc(opportunities.publishedAt), asc(opportunities.id)).limit(limit);
  return rows.map(fromDetailRow);
}

/**
 * A listing's skills and eligibility as columns of the listing query itself, so a list arrives in ONE round
 * trip (and one consistent snapshot) instead of listings first, then their skills and eligibility. Used on the
 * busiest dashboard pages. Both lookups use primary keys that start with opportunity_id.
 */
export const detailColumns = {
  skills: sql<OpportunityFull["skills"]>`coalesce((select json_agg(json_build_object('name', s.name, 'normalized', s.normalized, 'required', s.required)) from ${opportunitySkills} s where s.opportunity_id = ${opportunities.id}), '[]'::json)`,
  eligibility: sql<EligibilityRow | null>`(select json_build_object(
    'opportunityId', e.opportunity_id, 'educationLevels', e.education_levels, 'graduationYearMin', e.graduation_year_min,
    'graduationYearMax', e.graduation_year_max, 'minExperienceYears', e.min_experience_years, 'requiredCertifications', e.required_certifications,
    'allowedLocations', e.allowed_locations, 'requiresWorkAuthorizationIndia', e.requires_work_authorization_india, 'notes', e.notes
  ) from ${opportunityEligibility} e where e.opportunity_id = ${opportunities.id})`,
};
export function fromDetailRow(r: { o: OpportunityRow; skills: OpportunityFull["skills"]; eligibility: EligibilityRow | null }): OpportunityFull {
  return { ...r.o, skills: r.skills ?? [], eligibility: r.eligibility ?? null };
}

export async function withDetails(db: Db, rows: OpportunityRow[]): Promise<OpportunityFull[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [skills, elig] = await Promise.all([
    db.select().from(opportunitySkills).where(inArray(opportunitySkills.opportunityId, ids)),
    db.select().from(opportunityEligibility).where(inArray(opportunityEligibility.opportunityId, ids)),
  ]);
  return rows.map((r) => ({
    ...r,
    skills: skills.filter((s) => s.opportunityId === r.id).map(({ name, normalized, required }) => ({ name, normalized, required })),
    eligibility: elig.find((e) => e.opportunityId === r.id) ?? null,
  }));
}

export async function getOpportunityBySlug(db: Db, slug: string, { publicOnly = true } = {}): Promise<OpportunityFull | null> {
  const [row] = await db.select().from(opportunities).where(publicOnly ? and(eq(opportunities.slug, slug), publicVisibility()) : eq(opportunities.slug, slug));
  return row ? (await withDetails(db, [row]))[0] : null;
}

export async function getOpportunityById(db: Db, id: string): Promise<OpportunityFull | null> {
  const [row] = await db.select().from(opportunities).where(eq(opportunities.id, id));
  return row ? (await withDetails(db, [row]))[0] : null;
}

export async function similarOpportunities(db: Db, o: OpportunityFull, limit = 3) {
  const skillKeys = o.skills.map((s) => s.normalized);
  const rows = await db
    .select()
    .from(opportunities)
    .where(and(publicVisibility(), eq(opportunities.category, o.category), sql`${opportunities.id} <> ${o.id}`))
    .orderBy(desc(opportunities.publishedAt))
    .limit(20);
  const full = await withDetails(db, rows);
  return full
    .map((r) => ({ r, overlap: r.skills.filter((s) => skillKeys.includes(s.normalized)).length }))
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map((x) => x.r);
}

export function toFacts(o: OpportunityFull): OpportunityFacts {
  const e = o.eligibility;
  return {
    title: o.title,
    category: o.category,
    workMode: o.workMode,
    locations: o.locations,
    country: o.country,
    compMin: o.compMin,
    compMax: o.compMax,
    compPeriod: o.compPeriod,
    unpaid: o.unpaid,
    deadline: o.deadline,
    startDate: o.startDate,
    experienceMinYears: o.experienceMinYears,
    skills: o.skills.map((s) => ({ name: s.name, required: s.required })),
    eligibility: e
      ? {
          educationLevels: (e.educationLevels as EducationLevel[] | null) ?? null,
          graduationYearMin: e.graduationYearMin,
          graduationYearMax: e.graduationYearMax,
          minExperienceYears: e.minExperienceYears,
          requiredCertifications: e.requiredCertifications,
          allowedLocations: e.allowedLocations,
          requiresWorkAuthorizationIndia: e.requiresWorkAuthorizationIndia,
        }
      : null,
  };
}

// ─── Admin authoring ───────────────────────────────────────────────────────
const optInt = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().int().min(0).optional());
export const opportunityInput = z.object({
  title: z.string().trim().min(4).max(140),
  category: z.enum(CATEGORY_KEYS),
  employmentType: z.enum(["full_time", "part_time", "temporary", "contract"]).optional(),
  organizationName: z.string().trim().min(2).max(120),
  summary: z.string().trim().max(240).optional(),
  description: z.string().trim().min(40).max(10_000),
  responsibilities: z.string().trim().max(5_000).optional(),
  workMode: z.enum(["remote", "hybrid", "onsite"]),
  locations: z.string().trim().max(300).default(""),
  compMin: optInt,
  compMax: optInt,
  compPeriod: z.enum(["year", "month", "project", "total"]).optional(),
  unpaid: z.boolean().default(false),
  durationWeeks: optInt,
  experienceMinYears: optInt,
  deadline: z.preprocess((v) => (v ? new Date(String(v)) : undefined), z.date().optional()),
  applicationMethod: z.enum(["internal", "external"]),
  externalUrl: z.string().trim().max(500).optional(),
  requiredSkills: z.string().max(600).default(""),
  preferredSkills: z.string().max(600).default(""),
  educationLevels: z.array(z.enum(["secondary", "higher_secondary", "diploma", "bachelors", "masters", "doctorate"])).default([]),
  graduationYearMin: optInt,
  graduationYearMax: optInt,
  requiresWorkAuthorizationIndia: z.boolean().default(false),
  sourceUrl: z.string().trim().max(500).optional(),
  stipendNote: z.string().trim().max(200).optional(),
  conversionPossible: z.boolean().default(false),
  deliverables: z.string().trim().max(1_000).optional(),
  /** Category-specific fields, already validated by parseCategoryDetails (see domain/categories). */
  details: z.record(z.string(), z.unknown()).optional(),
}).refine((v) => v.compMin === undefined || v.compMax === undefined || v.compMax >= v.compMin, { message: "Maximum compensation must be at least the minimum", path: ["compMax"] });
export type OpportunityInput = z.infer<typeof opportunityInput>;

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function detailsFor(input: OpportunityInput): Record<string, unknown> {
  if (input.details) return input.details;
  if (input.category === "internship") return { stipendNote: input.stipendNote ?? null, conversionPossible: input.conversionPossible, certificate: null };
  if (input.category === "gig") return { deliverables: input.deliverables ?? null };
  return {};
}

async function snapshot(db: Pick<Db, "insert">, o: OpportunityRow, actorId: string | null) {
  await db.insert(opportunityVersions).values({ opportunityId: o.id, version: o.version, snapshot: o as unknown as Record<string, unknown>, changedBy: actorId });
}

async function writeChildren(tx: Pick<Db, "insert" | "delete">, id: string, input: OpportunityInput) {
  await tx.delete(opportunitySkills).where(eq(opportunitySkills.opportunityId, id));
  const req = parseSkillList(input.requiredSkills);
  const pref = parseSkillList(input.preferredSkills).filter((p) => !req.some((r) => normalizeSkill(r) === normalizeSkill(p)));
  const skillRows = [...req.map((name) => ({ name, required: true })), ...pref.map((name) => ({ name, required: false }))].map((s) => ({ opportunityId: id, name: s.name, normalized: normalizeSkill(s.name), required: s.required }));
  if (skillRows.length) await tx.insert(opportunitySkills).values(skillRows);
  await tx.delete(opportunityEligibility).where(eq(opportunityEligibility.opportunityId, id));
  await tx.insert(opportunityEligibility).values({
    opportunityId: id,
    educationLevels: input.educationLevels.length ? input.educationLevels : null,
    graduationYearMin: input.graduationYearMin ?? null,
    graduationYearMax: input.graduationYearMax ?? null,
    minExperienceYears: input.experienceMinYears ?? null,
    requiresWorkAuthorizationIndia: input.requiresWorkAuthorizationIndia,
  });
}

function columnsFor(input: OpportunityInput) {
  return {
    title: input.title,
    category: input.category,
    employmentType: input.category === "job" ? (input.employmentType ?? "full_time") : null,
    organizationName: input.organizationName,
    summary: input.summary ?? null,
    description: input.description,
    responsibilities: input.responsibilities ?? null,
    workMode: input.workMode,
    locations: input.locations.split(",").map((l) => l.trim()).filter(Boolean).slice(0, 10),
    compMin: input.unpaid ? null : (input.compMin ?? null),
    compMax: input.unpaid ? null : (input.compMax ?? null),
    compPeriod: input.unpaid ? null : (input.compPeriod ?? null),
    unpaid: input.unpaid,
    durationWeeks: input.durationWeeks ?? null,
    experienceMinYears: input.experienceMinYears ?? null,
    deadline: input.deadline ?? null,
    applicationMethod: input.applicationMethod,
    externalUrl: input.applicationMethod === "external" ? (input.externalUrl ?? null) : null,
    sourceUrl: input.sourceUrl ?? null,
    details: detailsFor(input),
  };
}

/** Who is acting and for which organization. Defaults: Avsar staff, no organization account. */
export interface OpportunityActor { role?: "admin" | "employer"; orgId?: string | null; orgVerified?: boolean }

export async function createOpportunity(db: Db, input: OpportunityInput, actorId: string, by: OpportunityActor = {}) {
  return db.transaction(async (tx) => {
    const base = slugify(`${input.title} ${input.organizationName}`) || "opportunity";
    const slug = `${base}-${createHash("sha1").update(`${base}${Date.now()}${Math.random()}`).digest("hex").slice(0, 6)}`;
    const [row] = await tx
      .insert(opportunities)
      .values({ ...columnsFor(input), slug, status: "draft", createdBy: actorId, questions: mergeQuestions(input.category, []), orgId: by.orgId ?? null, verification: by.orgVerified ? "org_verified" : "unverified" })
      .returning();
    await writeChildren(tx, row.id, input);
    await snapshot(tx, row, actorId);
    await audit(tx, { actorId, actorRole: by.role ?? "admin", action: "opportunity.create", targetType: "opportunity", targetId: row.id, metadata: by.orgId ? { orgId: by.orgId } : undefined });
    return row;
  });
}

export async function updateOpportunity(db: Db, id: string, input: OpportunityInput, actorId: string, by: OpportunityActor = {}) {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(opportunities).where(eq(opportunities.id, id)).for("update");
    if (!cur) throw new Error("NOT_FOUND");
    // Editing a live listing sends it back through review: published content is always reviewed content.
    const backToReview = cur.status === "published" || cur.status === "approved" || cur.status === "paused";
    const [row] = await tx
      .update(opportunities)
      .set({ ...columnsFor(input), questions: mergeQuestions(input.category, cur.questions), version: cur.version + 1, updatedAt: new Date(), status: backToReview ? "in_review" : cur.status, publishedAt: backToReview ? null : cur.publishedAt })
      .where(eq(opportunities.id, id))
      .returning();
    await writeChildren(tx, id, input);
    await snapshot(tx, row, actorId);
    await audit(tx, { actorId, actorRole: by.role ?? "admin", action: "opportunity.update", targetType: "opportunity", targetId: id, metadata: { version: row.version, returnedToReview: backToReview } });
    return row;
  });
}

export class TransitionError extends Error {
  constructor(message: string, public readonly problems: string[] = []) {
    super(message);
  }
}

export async function transitionOpportunity(db: Db, id: string, to: OpportunityStatus, actorId: string, reason?: string, by: OpportunityActor = {}) {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(opportunities).where(eq(opportunities.id, id)).for("update");
    if (!cur) throw new TransitionError("Opportunity not found");
    if (!canTransitionOpportunity(cur.status, to)) throw new TransitionError(`Cannot move from ${cur.status} to ${to}`);
    if (to === "published" || to === "approved") {
      const problems = publishProblems({ ...cur, isImported: Boolean(cur.importedAt) });
      if (problems.length) throw new TransitionError("This listing isn't ready to publish", problems);
    }
    const [row] = await tx
      .update(opportunities)
      .set({ status: to, updatedAt: new Date(), publishedAt: to === "published" ? new Date() : cur.publishedAt, lastVerifiedAt: to === "published" ? new Date() : cur.lastVerifiedAt })
      .where(eq(opportunities.id, id))
      .returning();
    await audit(tx, { actorId, actorRole: by.role ?? "admin", action: `opportunity.${to}`, targetType: "opportunity", targetId: id, metadata: { from: cur.status, reason: reason ?? null } });
    return row;
  });
}

// ─── Import pipeline: discovered → imported → normalized → deduplicated → validated → review ─────
export const importItemSchema = z.object({
  title: z.string(),
  organization: z.string(),
  category: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  workMode: z.string().optional(),
  applyUrl: z.string().optional(),
  sourceUrl: z.string().optional(),
  deadline: z.string().optional(),
  skills: z.array(z.string()).optional(),
});

export function dedupeKey(title: string, org: string) {
  return createHash("sha256").update(`${title.trim().toLowerCase().replace(/\s+/g, " ")}|${org.trim().toLowerCase()}`).digest("hex").slice(0, 32);
}

/** Imports a batch from an approved source. Nothing is published: valid items land in review as drafts. */
export async function importBatch(db: Db, sourceId: string, items: unknown[], actorId: string, now = new Date()) {
  const [source] = await db.select().from(opportunitySources).where(eq(opportunitySources.id, sourceId));
  if (!source || !source.active) throw new Error("SOURCE_NOT_ACTIVE");
  const summary = { queued: 0, duplicate: 0, invalid: 0 };
  for (const raw of items.slice(0, 500)) {
    const parsed = importItemSchema.safeParse(raw);
    const issues: string[] = [];
    if (!parsed.success) {
      await db.insert(importRecords).values({ sourceId, rawPayload: raw as object, dedupeKey: "invalid", status: "invalid", issues: ["Malformed item"] });
      summary.invalid++;
      continue;
    }
    const it = parsed.data;
    const category = (CATEGORY_KEYS as readonly string[]).includes(it.category ?? "") ? (it.category as CategoryKey) : "job";
    const workMode = ["remote", "hybrid", "onsite"].includes(it.workMode ?? "") ? (it.workMode as "remote" | "hybrid" | "onsite") : "onsite";
    const deadline = it.deadline ? new Date(it.deadline) : null;
    if (it.title.trim().length < 4) issues.push("Title too short");
    if ((it.description ?? "").trim().length < 40) issues.push("Description too short");
    if (deadline && (Number.isNaN(deadline.getTime()) || deadline <= now)) issues.push("Deadline missing or in the past");
    if (!it.sourceUrl) issues.push("Missing source URL");
    if (it.applyUrl && !it.applyUrl.startsWith("https://")) issues.push("Application link is not https");
    const key = dedupeKey(it.title, it.organization);
    const [dupe] = await db.select({ id: opportunities.id }).from(opportunities).innerJoin(importRecords, eq(importRecords.opportunityId, opportunities.id)).where(eq(importRecords.dedupeKey, key)).limit(1);
    const normalized = { ...it, category, workMode };
    if (dupe) {
      await db.insert(importRecords).values({ sourceId, rawPayload: raw as object, normalized, dedupeKey: key, status: "duplicate", issues: ["Matches an existing listing"], opportunityId: dupe.id });
      summary.duplicate++;
      continue;
    }
    if (issues.length) {
      await db.insert(importRecords).values({ sourceId, rawPayload: raw as object, normalized, dedupeKey: key, status: "invalid", issues });
      summary.invalid++;
      continue;
    }
    await db.transaction(async (tx) => {
      const slug = `${slugify(`${it.title} ${it.organization}`)}-${key.slice(0, 6)}`;
      const [row] = await tx.insert(opportunities).values({
        slug, title: it.title.trim(), category, organizationName: it.organization.trim(), description: it.description!.trim(), workMode,
        locations: it.location ? [it.location.trim()] : [], deadline, applicationMethod: it.applyUrl ? "external" : "internal", externalUrl: it.applyUrl ?? null,
        status: "in_review", sourceId, sourceUrl: it.sourceUrl ?? null, sourceProvider: source.name, importedAt: now, createdBy: actorId,
      }).returning();
      const skills = [...new Set((it.skills ?? []).map((s) => s.trim()).filter(Boolean))].slice(0, 20);
      if (skills.length) await tx.insert(opportunitySkills).values(skills.map((name) => ({ opportunityId: row.id, name, normalized: normalizeSkill(name), required: true }))).onConflictDoNothing();
      await tx.insert(importRecords).values({ sourceId, rawPayload: raw as object, normalized, dedupeKey: key, status: "queued", opportunityId: row.id });
      await snapshot(tx, row, actorId);
    });
    summary.queued++;
  }
  await db.update(opportunitySources).set({ lastImportAt: now }).where(eq(opportunitySources.id, sourceId));
  await audit(db, { actorId, actorRole: "admin", action: "import.batch", targetType: "source", targetId: sourceId, metadata: summary });
  return summary;
}
