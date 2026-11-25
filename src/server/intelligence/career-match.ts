/**
 * Career-intelligence matching: a staged, explainable pipeline on top of the existing engines.
 *
 *   A  Hard eligibility   domain/eligibility.ts (unchanged rules). Failing a stated requirement removes the
 *                         listing from recommendations; UNKNOWN eligibility is shown as unknown, never a failure.
 *   B  Skill fit          each listed skill vs the student's evidence-backed skill profile, through the registry:
 *                         exact concept, specialization (PostgreSQL → SQL) or a labelled "related" skill.
 *   C  Development        missing skills split into: in progress (student is learning/practising it), a
 *                         realistic next step (a prerequisite or related skill is already evidenced), or a gap.
 *   D  Personal fit       stated preferences only (location, work mode, category, role, pay), from domain/matching.ts.
 *   E  Ranking            documented features × versioned weights (SCORING). Unassessable features are dropped
 *                         and the rest renormalized, so missing data lowers confidence, not the score.
 *
 * Inputs never include institution names, gender, caste, religion, disability, health or age: CandidateFacts
 * does not carry them, and the scoring cannot see them. The score is a relative ordering, not a probability
 * of being hired, and is never shown as "job readiness".
 */
import { evaluateEligibility, type EligibilityResult } from "../domain/eligibility";
import { matchOpportunity } from "../domain/matching";
import type { CandidateFacts, OpportunityFacts } from "../domain/types";
import { classifyOpportunity, domainDef, domainOfConcept, domainRelation, type Classification, type DomainRelation } from "./domains";
import { STATE_LABEL, type SkillProfileEntry, type SkillState } from "./evidence";
import type { Relation, SkillRegistry } from "./registry";

/**
 * Versioned scoring configuration. Every number has a stated reason; they are priors to be checked with the
 * offline evaluation (intelligence/eval), not learned or validated values. Change = new version string.
 */
export const SCORING = {
  version: "career-match/v2",
  /** Strength of a skill state when it supports a requirement. Ordinal: verified > demonstrated > practiced > declared > learning. */
  stateStrength: { verified: 1, demonstrated: 0.85, practiced: 0.6, declared: 0.5, learning: 0.25 } satisfies Record<SkillState, number>,
  /** How much a relation counts. Related skills are partial and always labelled "related"; never full credit. */
  relationCredit: { exact: 1, specialization: 0.9, related: 0.4, none: 0 } satisfies Record<Relation, number>,
  /** Requirement weights: required counts twice a preferred one (same convention as domain/matching.ts); a skill only mentioned in the description counts half. */
  requirementWeight: { required: 2, preferred: 1, mentioned: 0.5 },
  /**
   * Feature weights. v2 (2026-11): role alignment 0.1 → 0.25, so the student's chosen career direction counts and a
   * listing in another field can't win on a few shared generic skills; skills still decide most of the order.
   */
  featureWeight: { skillFit: 0.5, roleAlignment: 0.25, personalFit: 0.25 },
  /** Role alignment by how the listing's field relates to the student's target (domains.ts). Unknown field → not assessed. */
  domainCredit: { role: 1, same: 0.8, adjacent: 0.5, group: 0.25, none: 0 },
  /**
   * The student has a target but the listing states no recognisable field. Not "not assessed": dropping it would let a
   * vague listing ("Summer Internship", Excel + English) outrank one clearly in the student's field on generic skills.
   * Not zero either: it may still fit. Found by the cross-domain evaluation (eval/domain-dataset.ts).
   */
  unknownFieldCredit: 0.3,
  rationale: "Skill evidence decides most of the order; the student's target role and field come next, with partial credit for neighbouring fields so they can explore; stated preferences break ties.",
} as const;

export type Provenance = "observed" | "inferred" | "unknown";
export interface Explanation { kind: Provenance; text: string }

export interface ListingSkill { name: string; required: boolean; origin?: "listed" | "text_mentioned" }

export interface SkillVerdict {
  requirement: string;
  importance: "required" | "preferred" | "mentioned";
  /** The student's skill that supports it, and how. Null when nothing does. */
  supportedBy: { name: string; state: SkillState; relation: Exclude<Relation, "none"> } | null;
  credit: number;
  development: "met" | "in_progress" | "next_step" | "gap";
  /** For next_step: the evidenced skill that makes it realistic. */
  via?: string;
}

export interface CareerMatch {
  version: string;
  eligibility: EligibilityResult;
  /** Excluded from recommendations (failed a stated requirement or closed). */
  excluded: boolean;
  score: number | null;
  /** Share of the feature weight that could be assessed (0–1). */
  coverage: number;
  features: { skillFit: number | null; roleAlignment: number | null; personalFit: number | null };
  skills: SkillVerdict[];
  role: { id: string; title: string } | null;
  /** The listing's field and how it relates to the student's target fields. */
  domain: { id: string | null; label: string | null; basis: Classification["basis"]; confidence: Classification["confidence"]; relation: DomainRelation | "role" | null };
  explanations: Explanation[];
  learnNext: string[];
  /**
   * Relevance gate (independent of the score): the listing is in the student's direction (their target role, its field
   * or a neighbouring one), or the student's evidence covers at least one SPECIFIC skill it asks for. Generic skills
   * (concepts that point to no field: Excel, communication, MS Office…) never make a listing relevant on their own.
   * With no target and no specific skills on the profile there is nothing to judge by, so everything stays relevant.
   */
  relevant: boolean;
  /** The specific (field-bearing) skills the student's evidence covers for this listing. */
  specificSkills: string[];
}

/** Soft skills and office basics written as free text: shared by nearly every listing, so they show no direction. */
const GENERIC_TEXT = /^(communication|communications|teamwork|team work|team player|leadership|problem solving|problem-solving|time management|interpersonal|adaptability|critical thinking|creativity|attention to detail|multitasking|multi-tasking|hard working|hardworking|ms office|microsoft office|computer skills|basic computer|english|organisational|organizational)( skills?)?$/;

/**
 * A skill is specific when it points to a field (domains.ts). Unknown free-text skills count as specific (an exact
 * unusual skill is a strong signal) unless they're common soft skills or office basics.
 */
export function isSpecificSkill(reg: SkillRegistry, key: string): boolean {
  if (key.startsWith("text:")) return !GENERIC_TEXT.test(key.slice(5).trim());
  return domainOfConcept(reg, key) !== null;
}

/**
 * A target role worked out from evidence when the student hasn't stated one: the catalogue role whose ESSENTIAL skills
 * the profile best covers (exact or specialization, anything but "learning"), needing at least two essentials and at
 * least half of them. Null when nothing is that clear: no guess is better than a wrong one.
 */
export function inferTargetRole(reg: SkillRegistry, profile: SkillProfileEntry[]): { id: string; title: string; covered: string[] } | null {
  const usable = profile.filter((e) => e.state !== "learning");
  let best: { id: string; title: string; covered: string[]; ratio: number } | null = null;
  for (const role of reg.roles) {
    if (!role.essential.length) continue;
    const covered = role.essential.filter((id) => {
      const s = bestSupport(reg, usable, id);
      return s && (s.rel === "exact" || s.rel === "specialization");
    });
    const ratio = covered.length / role.essential.length;
    if (covered.length < 2 || ratio < 0.5) continue;
    if (!best || ratio > best.ratio || (ratio === best.ratio && covered.length > best.covered.length)) best = { id: role.id, title: role.title, covered: covered.map((id) => reg.displayName(id, id)), ratio };
  }
  return best && { id: best.id, title: best.title, covered: best.covered };
}

function bestSupport(reg: SkillRegistry, profile: SkillProfileEntry[], want: string) {
  let best: { e: SkillProfileEntry; rel: Exclude<Relation, "none">; credit: number } | null = null;
  for (const e of profile) {
    const rel = e.conceptId && !want.startsWith("text:") ? reg.relation(e.conceptId, want) : e.key === want ? "exact" : "none";
    if (rel === "none") continue;
    const credit = SCORING.relationCredit[rel] * SCORING.stateStrength[e.state];
    if (!best || credit > best.credit) best = { e, rel, credit };
  }
  return best;
}

export function careerMatch(
  reg: SkillRegistry,
  candidate: CandidateFacts,
  profile: SkillProfileEntry[],
  opp: OpportunityFacts & { skills: ListingSkill[] },
  opts: { targetRoles?: string[]; now?: Date } = {},
): CareerMatch {
  const now = opts.now ?? new Date();
  const explanations: Explanation[] = [];

  // A — hard eligibility
  const eligibility = evaluateEligibility(candidate, opp, now);
  const closed = eligibility.checks.some((c) => c.key === "deadline" && c.outcome === "fail");
  const excluded = closed || eligibility.status === "ineligible";
  for (const c of eligibility.checks) {
    if (c.key === "deadline") continue;
    explanations.push({ kind: c.outcome === "unknown" ? "unknown" : "observed", text: `${c.label}: ${c.outcome === "unknown" ? `not known yet. ${c.detail}` : c.detail}` });
  }

  // B + C — skills and development
  const byKey = new Map(profile.map((e) => [e.key, e]));
  const verdicts: SkillVerdict[] = [];
  let earned = 0;
  let possible = 0;
  for (const s of opp.skills) {
    const importance = s.origin === "text_mentioned" ? "mentioned" : s.required ? "required" : "preferred";
    const w = SCORING.requirementWeight[importance];
    const want = reg.key(s.name);
    const sup = bestSupport(reg, profile, want);
    possible += w;
    earned += w * (sup?.credit ?? 0);
    let development: SkillVerdict["development"] = "gap";
    let via: string | undefined;
    const own = byKey.get(want);
    if (sup && (sup.rel === "exact" || sup.rel === "specialization") && (sup.e.state === "verified" || sup.e.state === "demonstrated" || sup.e.state === "declared")) development = "met";
    else if (own && (own.state === "learning" || own.state === "practiced")) development = "in_progress";
    else if (!want.startsWith("text:")) {
      // Realistic next step only when something it builds on is evidenced (not merely declared or asked about).
      const stepping = [...reg.prerequisites(want), ...reg.relatedTo(want)]
        .map((id) => byKey.get(id))
        .find((e) => e && (e.state === "verified" || e.state === "demonstrated" || e.state === "practiced"));
      if (stepping) {
        development = "next_step";
        via = stepping.name;
      }
    }
    verdicts.push({ requirement: s.name, importance, supportedBy: sup ? { name: sup.e.name, state: sup.e.state, relation: sup.rel } : null, credit: Math.round((sup?.credit ?? 0) * 100) / 100, development, via });
  }
  const skillFit = opp.skills.length && profile.length ? earned / possible : null;

  const met = verdicts.filter((v) => v.supportedBy && (v.supportedBy.relation === "exact" || v.supportedBy.relation === "specialization"));
  if (met.length) explanations.push({ kind: "observed", text: `Your evidence covers ${met.slice(0, 4).map((v) => `${v.requirement} (${STATE_LABEL[v.supportedBy!.state].toLowerCase()})`).join(", ")}${met.length > 4 ? ` and ${met.length - 4} more` : ""}` });
  for (const v of verdicts.filter((x) => x.supportedBy?.relation === "related").slice(0, 2)) {
    explanations.push({ kind: "inferred", text: `${v.requirement} is not on your profile; your ${v.supportedBy!.name} is a related skill, so it counts only partly` });
  }
  const missingReq = verdicts.filter((v) => v.importance === "required" && !v.supportedBy);
  if (missingReq.length) explanations.push({ kind: "observed", text: `Not yet shown on your profile (required): ${missingReq.map((v) => v.requirement).join(", ")}` });
  if (!opp.skills.length) explanations.push({ kind: "unknown", text: "This listing names no skills, so skill fit can't be assessed" });
  else if (!profile.length) explanations.push({ kind: "unknown", text: "Your profile has no skills yet, so skill fit can't be assessed. That says nothing about your ability." });

  // Role alignment: the listing's role and field vs the student's chosen target roles (explicit preference only).
  // The field comes from the title, or from the listed skills when the title names no known role (domains.ts).
  const cls = classifyOpportunity(reg, opp);
  const role = cls.roleId ? reg.roles.find((r) => r.id === cls.roleId) ?? null : null;
  const targets = (opts.targetRoles ?? []).map((t) => reg.roleFor(t)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  let relation: DomainRelation | "role" | null = null;
  if (targets.length && cls.domain) {
    relation = role && targets.some((t) => t.id === role.id) ? "role" : "none";
    if (relation !== "role") {
      const order: DomainRelation[] = ["same", "adjacent", "group"];
      for (const r of order) if (relation === "none" && targets.some((t) => domainRelation(t.domain, cls.domain) === r)) relation = r;
    }
  }
  const roleAlignment = relation !== null ? SCORING.domainCredit[relation] : targets.length ? SCORING.unknownFieldCredit : null;
  const fieldLabel = domainDef(cls.domain)?.label ?? null;
  if (targets.length && !cls.domain) explanations.push({ kind: "unknown", text: "The listing doesn't say which field it is in, so we can't tell if it fits your direction" });
  if (relation === "role") explanations.push({ kind: "observed", text: `Matches your target role (${role!.title})` });
  else if (relation === "same") explanations.push({ kind: cls.basis === "title" ? "observed" : "inferred", text: `In your field: ${fieldLabel}` });
  else if (relation === "adjacent") explanations.push({ kind: "inferred", text: `Close to your field: ${fieldLabel}, a good way to explore` });

  // D — personal fit from the existing preference factors (location, work mode, category/role/pay).
  const base = matchOpportunity(candidate, opp, undefined, now);
  const prefs = base.factors.filter((f) => (f.factor === "location" || f.factor === "workMode" || f.factor === "preferences") && f.assessed);
  const personalFit = prefs.length ? prefs.reduce((s, f) => s + f.value, 0) / prefs.length : null;
  for (const f of prefs) if (f.value >= 1) explanations.push({ kind: "observed", text: f.note });

  // E — ranking score over assessable features
  const feats = { skillFit, roleAlignment, personalFit };
  let num = 0;
  let den = 0;
  for (const [k, v] of Object.entries(feats) as [keyof typeof feats, number | null][]) {
    if (v === null) continue;
    num += SCORING.featureWeight[k] * v;
    den += SCORING.featureWeight[k];
  }
  const total = Object.values(SCORING.featureWeight).reduce((a, b) => a + b, 0);
  // A listing that names skills is not ranked on preferences alone: until skill fit is assessable it stays unscored
  // (listed after scored ones, never above them), so "near you" can't outrank "qualified for it".
  const score = den && !(opp.skills.length > 0 && skillFit === null) ? Math.round((num / den) * 100) : null;

  // Relevance gate: direction, or at least one specific skill covered (exact, specialization or related).
  const specificSkills = verdicts.filter((v) => v.supportedBy && isSpecificSkill(reg, reg.key(v.requirement))).map((v) => v.requirement);
  const profileHasSpecific = profile.some((e) => e.state !== "learning" && isSpecificSkill(reg, e.key));
  const inDirection = relation === "role" || relation === "same" || relation === "adjacent";
  const relevant = inDirection || specificSkills.length > 0 || (!targets.length && !profileHasSpecific);

  const learnNext = [
    ...verdicts.filter((v) => v.importance === "required" && v.development === "next_step"),
    ...verdicts.filter((v) => v.importance === "required" && (v.development === "in_progress" || v.development === "gap")),
    ...verdicts.filter((v) => v.importance !== "required" && v.development !== "met" && !v.supportedBy),
  ].map((v) => v.requirement).filter((s, i, a) => a.indexOf(s) === i).slice(0, 4);

  return {
    version: SCORING.version,
    eligibility,
    excluded,
    score,
    coverage: Math.round((den / total) * 100) / 100,
    features: { skillFit: skillFit === null ? null : Math.round(skillFit * 100) / 100, roleAlignment, personalFit: personalFit === null ? null : Math.round(personalFit * 100) / 100 },
    skills: verdicts,
    role: role ? { id: role.id, title: role.title } : null,
    domain: { id: cls.domain, label: fieldLabel, basis: cls.basis, confidence: cls.confidence, relation },
    explanations,
    learnNext,
    relevant,
    specificSkills,
  };
}

/** Recommendation order: excluded listings never appear; then score (unscored last), earlier deadline, id. Deterministic. */
export function rankCareerMatches<T extends { id: string; deadline: Date | null; match: CareerMatch }>(items: T[], limit = 10): T[] {
  return items
    .filter((x) => !x.match.excluded)
    .sort((a, b) => (b.match.score ?? -1) - (a.match.score ?? -1) || (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, limit);
}

/** Readiness for a target role: which essential/optional skills are evidenced and how. No single percentage. */
export function roleReadiness(reg: SkillRegistry, roleId: string, profile: SkillProfileEntry[]) {
  const role = reg.roles.find((r) => r.id === roleId);
  if (!role) return null;
  const row = (id: string, importance: "essential" | "optional") => {
    const sup = bestSupport(reg, profile, id);
    return { conceptId: id, name: reg.displayName(id, id), importance, supportedBy: sup ? { name: sup.e.name, state: sup.e.state, relation: sup.rel } : null };
  };
  const skills = [...role.essential.map((id) => row(id, "essential")), ...role.optional.map((id) => row(id, "optional"))];
  const strong = (s: (typeof skills)[number]) => s.supportedBy && s.supportedBy.relation !== "related" && ["verified", "demonstrated"].includes(s.supportedBy.state);
  return {
    role: { id: role.id, title: role.title },
    skills,
    essentialEvidenced: skills.filter((s) => s.importance === "essential" && strong(s)).length,
    essentialTotal: role.essential.length,
    missingEssential: skills.filter((s) => s.importance === "essential" && !s.supportedBy).map((s) => s.name),
  };
}
