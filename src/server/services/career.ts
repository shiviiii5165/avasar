import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { audit } from "../audit";
import type { Db } from "../db/client";
import { candidateProfiles, learningEvidence } from "../db/schema";
import { distinctListings } from "../ingestion/dedupe";
import { careerMatch, inferTargetRole, rankCareerMatches, roleReadiness, type CareerMatch } from "../intelligence/career-match";
import { buildSkillProfile, collectEvidence, type EvidenceType, type SkillProfileEntry } from "../intelligence/evidence";
import { matcherFor, type Matcher, type MatchInput } from "../intelligence/canonical-match";
import { registry } from "../intelligence/registry";
import { hasAnyId, listOpenOpportunities, toFacts, type OpportunityFull } from "./opportunities";
import { experienceSkillLinks, loadProfile, toCandidateFacts, type LoadedProfile } from "./profiles";

/** Evidence types a student can switch off for their career profile ("ait_all" = everything from AI Tathastu). */
export const CONTROLLABLE_EVIDENCE: { key: EvidenceType | "ait_all"; label: string }[] = [
  { key: "ait_all", label: "Everything from AI Tathastu" },
  { key: "ait_learning", label: "Topics studied on AI Tathastu" },
  { key: "ait_practice", label: "Practice and learning tasks on AI Tathastu" },
  { key: "assessment", label: "Assessment results" },
  { key: "imported_profile", label: "Skills listed on my AI Tathastu profile" },
  { key: "certification", label: "Certificates" },
];

export async function loadEvidence(db: Db, p: LoadedProfile) {
  const profileId = p.profile.id;
  const [links, learning] = await Promise.all([
    experienceSkillLinks(db, profileId),
    db.select().from(learningEvidence).where(eq(learningEvidence.profileId, profileId)).orderBy(desc(learningEvidence.occurredAt)).limit(500),
  ]);
  const items = collectEvidence(
    {
      skills: p.skills.map((s) => ({ id: s.id, name: s.name, source: s.source, createdAt: s.createdAt })),
      projects: p.projects.map((x) => ({ id: x.id, title: x.title, skills: x.skills, source: x.source, createdAt: x.createdAt })),
      experienceLinks: links.map((l) => ({ skillName: l.skillName, experienceId: l.experienceId, label: `${l.title} at ${l.org}`, createdAt: l.createdAt })),
      certifications: p.certifications.map((c) => ({ id: c.id, name: c.name, source: c.source, issuedOn: c.issuedOn })),
      aitSkills: p.profile.aitInsights.skills ?? null,
      aitSyncedAt: p.profile.aitSyncedAt,
      learning,
    },
    registry(),
  );
  return { items, learning };
}

export interface CareerIntelligence {
  skills: SkillProfileEntry[];
  targetRoles: string[];
  targetSource: "stated" | "inferred" | "none";
  readiness: NonNullable<ReturnType<typeof roleReadiness>>[];
  recommendations: { o: OpportunityFull; match: CareerMatch }[];
  roadmap: { skill: string; conceptId: string; why: string; buildsOn: string | null; openListings: number }[];
  learning: (typeof learningEvidence.$inferSelect)[];
  openListings: number;
  aitLearnUrl: string | null;
}

/**
 * The ONE input every page matches with: matching facts, the evidence-based skill profile (after the student's
 * exclusions) and target roles. Pages build their matcher from this (matcherFor), so scores agree everywhere.
 */
export async function matchInputFor(db: Db, p: LoadedProfile, now = new Date()): Promise<{ input: MatchInput; learning: (typeof learningEvidence.$inferSelect)[] }> {
  const { items, learning } = await loadEvidence(db, p);
  const ait = p.profile.aitInsights;
  // Every kind of evidence on the profile counts; there is no per-type opt-out on the career page.
  // (What AI Tathastu sends at all is still governed by the student's consent there.)
  const profile = buildSkillProfile(items, registry(), { now });
  // The target comes from the student: their roles in Avsar and their AI Tathastu career goal. Only when there is none
  // is one worked out from their evidence (labelled as such wherever it is shown), so nobody has to fill a form first.
  const stated = [...new Set([...p.profile.preferredRoles, ...(ait.goals?.targetRole ? [ait.goals.targetRole] : [])])];
  const inferred = stated.length ? null : inferTargetRole(registry(), profile);
  return {
    input: {
      facts: toCandidateFacts(p),
      profile,
      targetRoles: stated.length ? stated : inferred ? [inferred.title] : [],
      targetSource: stated.length ? "stated" : inferred ? "inferred" : "none",
    },
    learning,
  };
}

/** AI Tathastu Learning, when a valid https base URL is configured. */
export function aitLearnUrl(): string | null {
  const base = process.env.AVSAR_AIT_BASE_URL?.trim().replace(/\/$/, "");
  return base && /^https:\/\//.test(base) ? `${base}/learning` : null;
}

/** Matcher for a loaded profile (null when there is none: signed out). */
export async function matcherForProfile(db: Db, p: LoadedProfile | null, now = new Date()): Promise<Matcher | null> {
  return p ? matcherFor(registry(), (await matchInputFor(db, p, now)).input) : null;
}

/** Everything the career dashboard shows, for the signed-in student's OWN profile only (profileId comes from the session). */
export async function careerIntelligence(db: Db, profileId: string, now = new Date(), opts: { exclude?: ReadonlySet<string> } = {}): Promise<CareerIntelligence | null> {
  const [p, open] = await Promise.all([loadProfile(db, profileId), listOpenOpportunities(db, undefined, now)]);
  if (!p) return null;
  const reg = registry();
  const { input, learning } = await matchInputFor(db, p, now);
  const { facts, profile: skills, targetRoles } = input;

  const scored = open.map((o) => ({ id: o.id, deadline: o.deadline, o, match: careerMatch(reg, facts, skills, { ...toFacts(o), skills: o.skills.map((s) => ({ name: s.name, required: s.required, origin: s.origin })) }, { targetRoles, now }) }));
  // Ranking is unchanged; the same listing reached through two feeds (or posted twice) is then shown once, in its best-ranked position.
  const TIER = { strong: 0, good: 1, weak: 2 } as const;
  const ranked = rankCareerMatches(scored.filter((x) => x.match.relevant && (!opts.exclude || !hasAnyId(opts.exclude, x.o))), scored.length)
    .sort((a, b) => TIER[a.match.tier] - TIER[b.match.tier]); // stable: score order kept within a tier
  const recommendations = distinctListings(ranked, ({ o }) => ({ sourceId: o.sourceId, sourceRecordId: o.sourceRecordId, urls: [o.sourceUrl, o.externalUrl], fingerprint: o.contentFingerprint, title: o.title, organization: o.organizationName, locations: o.locations, workMode: o.workMode, description: o.description, deadline: o.deadline }), 8).map(({ o, match }) => ({ o, match }));

  const roleIds = [...new Set(targetRoles.map((t) => reg.roleFor(t)?.id).filter((x): x is string => Boolean(x)))].slice(0, 3);
  const readiness = roleIds.map((id) => roleReadiness(reg, id, skills)).filter((r): r is NonNullable<typeof r> => r !== null);

  // Roadmap: missing skills of the first target role, prerequisites first, each tied to how many open listings ask for it.
  const demand = new Map<string, number>();
  for (const o of open) for (const s of o.skills) {
    const id = reg.resolve(s.name);
    if (id && s.origin !== "text_mentioned") demand.set(id, (demand.get(id) ?? 0) + 1);
  }
  const have = new Set(skills.filter((s) => s.conceptId && s.state !== "learning").map((s) => s.conceptId!));
  const roadmap: CareerIntelligence["roadmap"] = [];
  const first = readiness[0];
  if (first) {
    const missing = first.skills.filter((s) => !s.supportedBy || s.supportedBy.relation === "related");
    const ordered: typeof missing = [];
    const pending = [...missing];
    // Simple topological order: a skill comes after any of its missing prerequisites.
    for (let guard = 0; pending.length && guard < 50; guard++) {
      const i = pending.findIndex((m) => !reg.prerequisites(m.conceptId).some((pre) => pending.some((x) => x.conceptId === pre)));
      ordered.push(...pending.splice(i < 0 ? 0 : i, 1));
    }
    for (const m of ordered.slice(0, 6)) {
      const buildsOn = reg.prerequisites(m.conceptId).concat(reg.relatedTo(m.conceptId)).find((id) => have.has(id)) ?? null;
      roadmap.push({
        skill: m.name,
        conceptId: m.conceptId,
        why: `${m.importance === "essential" ? "Essential" : "Useful"} for ${first.role.title}`,
        buildsOn: buildsOn ? reg.displayName(buildsOn, buildsOn) : null,
        openListings: demand.get(m.conceptId) ?? 0,
      });
    }
  }

  return { skills, targetRoles, targetSource: input.targetSource ?? "none", readiness, recommendations, roadmap, learning, openListings: open.length, aitLearnUrl: aitLearnUrl() };
}

// ─── Student controls (always scoped to the caller's own profile) ─────────
const controllable = new Set(CONTROLLABLE_EVIDENCE.map((c) => c.key as string));

export async function setExcludedEvidenceTypes(db: Db, profileId: string, types: string[], actorId: string) {
  const clean = [...new Set(types.filter((t) => controllable.has(t)))];
  await db.update(candidateProfiles).set({ excludedEvidenceTypes: clean, updatedAt: new Date() }).where(eq(candidateProfiles.id, profileId));
  await audit(db, { actorId, actorRole: "candidate", action: "career.evidence_preferences", targetType: "profile", targetId: profileId, metadata: { excluded: clean } });
}

export async function setLearningEvidenceIncluded(db: Db, profileId: string, evidenceId: string, included: boolean) {
  // Scoped by profileId: another student's row can never be changed, and no error says whether it exists.
  await db.update(learningEvidence).set({ includedInProfile: included }).where(and(eq(learningEvidence.id, evidenceId), eq(learningEvidence.profileId, profileId)));
}

// ─── AI Tathastu learning.evidence events ─────────────────────────────────
export const learningEventSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(["asked", "practiced", "task_completed", "assessment_attempted", "assessment_passed", "project_demonstrated"]),
  skill: z.string().trim().min(1).max(80),
  title: z.string().trim().max(120).nullish(),
  occurredAt: z.string().datetime({ offset: true }),
  score: z.number().int().min(0).max(100_000).nullish(),
  maxScore: z.number().int().min(1).max(100_000).nullish(),
  verified: z.boolean().nullish(),
}).refine((e) => e.score == null || (e.maxScore != null && e.score <= e.maxScore), { message: "score needs maxScore and must not exceed it" });
export const learningBatchSchema = z.array(learningEventSchema).min(1).max(100);

/**
 * Stores structured learning events for a profile. Requires the student's "learning" consent on AI Tathastu
 * (privacy.scopes.learning, stored in aitScopes on each sync): without it nothing is stored. Titles are
 * capped; no conversation text is accepted by the schema at all.
 */
export async function storeLearningEvidence(db: Db, profileId: string, events: z.infer<typeof learningBatchSchema>, now = new Date()) {
  const [profile] = await db.select({ scopes: candidateProfiles.aitScopes }).from(candidateProfiles).where(eq(candidateProfiles.id, profileId));
  if (!profile || profile.scopes.learning !== true) return { stored: 0, consent: false as const };
  const reg = registry();
  let stored = 0;
  for (const e of events) {
    const occurredAt = new Date(e.occurredAt);
    if (occurredAt.getTime() > now.getTime() + 5 * 60_000) continue; // future-dated: refuse rather than trust
    const res = await db
      .insert(learningEvidence)
      .values({ profileId, externalId: e.id, kind: e.kind, skillName: e.skill, conceptId: reg.resolve(e.skill), title: e.title ?? null, score: e.score ?? null, maxScore: e.score != null ? (e.maxScore ?? null) : null, verified: e.verified === true, occurredAt })
      .onConflictDoNothing()
      .returning({ id: learningEvidence.id });
    stored += res.length;
  }
  return { stored, consent: true as const };
}

/** Removes everything AI Tathastu contributed to learning evidence (revocation or withdrawn consent). */
export async function clearLearningEvidence(db: Db, profileIds: string[]) {
  if (profileIds.length) await db.delete(learningEvidence).where(inArray(learningEvidence.profileId, profileIds));
}
