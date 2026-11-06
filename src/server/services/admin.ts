import "server-only";

import { and, count, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";

import type { Db } from "../db/client";
import {
  applications,
  auditLogs,
  candidateProfiles,
  importRecords,
  jobs,
  moderationCases,
  opportunities,
  opportunitySources,
  organizations,
  supportTickets,
  userIdentities,
  verificationRequests,
} from "../db/schema";
import { SUCCESS_OUTCOMES } from "../domain/workflows";

/**
 * Platform metrics. Each has a written definition (docs/PRODUCT_REQUIREMENTS.md §Metrics). Sample listings and
 * their applications are always excluded; nothing here is estimated or padded.
 */
export const METRIC_DEFINITIONS = {
  activeCandidates: "Candidate profiles whose identity signed in during the last 30 days.",
  publishedOpportunities: "Non-sample listings with status published and deadline not passed.",
  applications: "Applications submitted to non-sample listings (all time).",
  successfulOutcomes: "Applications on non-sample listings whose status is Selected. Applications alone are never counted as outcomes.",
  openReports: "Moderation cases with status open or escalated.",
  moderationTurnaround: "Median hours from case creation to resolution, last 30 days.",
  verifiedOrganizations: "Organizations with verification status Verified.",
} as const;

export async function platformMetrics(db: Db, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const nonSample = eq(opportunities.isSample, false);
  const [[active], [published], [apps], [outcomes], [reports], resolved, [verified], [samples]] = await Promise.all([
    db.select({ n: count() }).from(candidateProfiles).innerJoin(userIdentities, eq(candidateProfiles.identityId, userIdentities.id)).where(gte(userIdentities.lastLoginAt, since)),
    db.select({ n: count() }).from(opportunities).where(and(nonSample, eq(opportunities.status, "published"), sql`(${opportunities.deadline} is null or ${opportunities.deadline} > ${now})`)),
    db.select({ n: count() }).from(applications).innerJoin(opportunities, eq(applications.opportunityId, opportunities.id)).where(nonSample),
    db.select({ n: count() }).from(applications).innerJoin(opportunities, eq(applications.opportunityId, opportunities.id)).where(and(nonSample, inArray(applications.status, SUCCESS_OUTCOMES))),
    db.select({ n: count() }).from(moderationCases).where(inArray(moderationCases.status, ["open", "escalated"])),
    db.select({ created: moderationCases.createdAt, resolved: moderationCases.resolvedAt }).from(moderationCases).where(and(gte(moderationCases.createdAt, since), sql`${moderationCases.resolvedAt} is not null`)),
    db.select({ n: count() }).from(organizations).where(eq(organizations.verificationStatus, "verified")),
    db.select({ n: count() }).from(opportunities).where(eq(opportunities.isSample, true)),
  ]);
  const hours = resolved.map((r) => (r.resolved!.getTime() - r.created.getTime()) / 3_600_000).sort((a, b) => a - b);
  const median = hours.length ? Math.round(hours[Math.floor(hours.length / 2)] * 10) / 10 : null;
  return {
    activeCandidates: active.n,
    publishedOpportunities: published.n,
    applications: apps.n,
    successfulOutcomes: outcomes.n,
    openReports: reports.n,
    moderationTurnaround: median,
    verifiedOrganizations: verified.n,
    sampleListings: samples.n,
  };
}

export async function reviewQueue(db: Db) {
  return db.select().from(opportunities).where(inArray(opportunities.status, ["draft", "imported", "in_review", "approved"])).orderBy(desc(opportunities.updatedAt)).limit(100);
}

export async function listOpportunitiesAdmin(db: Db, status?: string) {
  return db
    .select()
    .from(opportunities)
    .where(status ? eq(opportunities.status, status as "draft") : undefined)
    .orderBy(desc(opportunities.updatedAt))
    .limit(200);
}

export async function listApplicationsAdmin(db: Db) {
  return db
    .select({ a: applications, o: { id: opportunities.id, title: opportunities.title, organizationName: opportunities.organizationName, isSample: opportunities.isSample }, p: { fullName: candidateProfiles.fullName } })
    .from(applications)
    .innerJoin(opportunities, eq(applications.opportunityId, opportunities.id))
    .innerJoin(candidateProfiles, eq(applications.profileId, candidateProfiles.id))
    .orderBy(desc(applications.submittedAt))
    .limit(200);
}

/** Candidate list with minimal fields: support/admin need to find a person, not browse private details. */
export async function listCandidates(db: Db) {
  return db
    .select({ id: candidateProfiles.id, fullName: candidateProfiles.fullName, city: candidateProfiles.city, careerStage: candidateProfiles.careerStage, visibility: candidateProfiles.visibility, onboarded: candidateProfiles.onboardingCompletedAt, createdAt: candidateProfiles.createdAt, provider: userIdentities.provider, disabled: userIdentities.disabledAt })
    .from(candidateProfiles)
    .innerJoin(userIdentities, eq(candidateProfiles.identityId, userIdentities.id))
    .where(isNull(userIdentities.deletedAt))
    .orderBy(desc(candidateProfiles.createdAt))
    .limit(200);
}

export async function listSources(db: Db) {
  const sources = await db.select().from(opportunitySources).orderBy(opportunitySources.name);
  const counts = await db.select({ sourceId: importRecords.sourceId, status: importRecords.status, n: count() }).from(importRecords).groupBy(importRecords.sourceId, importRecords.status);
  return sources.map((s) => ({ ...s, imports: Object.fromEntries(counts.filter((c) => c.sourceId === s.id).map((c) => [c.status, c.n])) as Record<string, number> }));
}

export async function recentImportIssues(db: Db) {
  return db.select().from(importRecords).where(ne(importRecords.status, "queued")).orderBy(desc(importRecords.createdAt)).limit(50);
}

export async function listAudit(db: Db, limit = 200) {
  return db
    .select({ log: auditLogs, actor: { name: userIdentities.name } })
    .from(auditLogs)
    .leftJoin(userIdentities, eq(auditLogs.actorIdentityId, userIdentities.id))
    .orderBy(desc(auditLogs.at))
    .limit(limit);
}

export async function listOrganizations(db: Db) {
  return db.select().from(organizations).orderBy(desc(organizations.createdAt)).limit(200);
}

export async function listVerificationRequests(db: Db) {
  return db
    .select({ r: verificationRequests, org: { name: organizations.name, website: organizations.website, domain: organizations.domain } })
    .from(verificationRequests)
    .innerJoin(organizations, eq(verificationRequests.orgId, organizations.id))
    .orderBy(desc(verificationRequests.createdAt))
    .limit(100);
}

export async function listTickets(db: Db) {
  return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(200);
}

export async function systemHealth(db: Db) {
  const started = Date.now();
  let dbOk = true;
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbOk = false;
  }
  const latencyMs = Date.now() - started;
  const byStatus = dbOk ? await db.select({ status: jobs.status, n: count() }).from(jobs).groupBy(jobs.status) : [];
  const dead = dbOk ? await db.select().from(jobs).where(eq(jobs.status, "dead")).orderBy(desc(jobs.createdAt)).limit(20) : [];
  const oldestQueued = dbOk ? (await db.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.status, "queued")).orderBy(jobs.runAt).limit(1))[0]?.runAt ?? null : null;
  return { dbOk, latencyMs, jobs: Object.fromEntries(byStatus.map((b) => [b.status, b.n])) as Record<string, number>, dead, oldestQueued };
}
