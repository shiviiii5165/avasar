/**
 * THE matching function for every student-facing surface (Discover, search "best match", listing detail, Apply,
 * home, insights and the career page). It is career-match/v2 (evidence-aware, registry-based, domain-aware) presented in the
 * MatchResult shape the UI components read, so one listing has one score everywhere.
 *
 * domain/matching.ts is no longer called by pages: it remains only as the personal-fit component inside
 * career-match (location, work mode, stated preferences).
 */
import type { CanonicalFeature, MatchResult } from "../domain/matching";
import type { CandidateFacts, OpportunityFacts } from "../domain/types";
import { careerMatch, SCORING, type CareerMatch } from "./career-match";
import type { SkillProfileEntry } from "./evidence";
import type { SkillRegistry } from "./registry";

export interface MatchInput {
  facts: CandidateFacts;
  /** The evidence-based skill profile (buildSkillProfile), after the student's own exclusions. */
  profile: SkillProfileEntry[];
  targetRoles: string[];
  /** Where the target came from: the student (profile or AI Tathastu goal), worked out from their evidence, or none. */
  targetSource?: "stated" | "inferred" | "none";
}

export type Matcher = (opp: OpportunityFacts, now?: Date) => MatchResult;

const FEATURE_NOTE: Record<CanonicalFeature, string> = {
  skillFit: "Listed skills against your evidence",
  roleAlignment: "Listing role and field against your target role",
  personalFit: "Location, work mode and stated preferences",
};

const STRONG = new Set(["verified", "demonstrated"]);

export function toMatchResult(cm: CareerMatch): MatchResult {
  const met = cm.skills.filter((v) => v.supportedBy && (v.supportedBy.relation === "exact" || v.supportedBy.relation === "specialization"));
  const evidence: MatchResult["evidence"] = !met.length
    ? "none"
    : met.some((v) => STRONG.has(v.supportedBy!.state))
      ? "high"
      : met.some((v) => v.supportedBy!.state === "practiced")
        ? "medium"
        : "low";
  const missingRequired = cm.skills.filter((v) => v.importance === "required" && !v.supportedBy).map((v) => v.requirement);
  const missingPreferred = cm.skills.filter((v) => v.importance === "preferred" && !v.supportedBy).map((v) => v.requirement);

  const nextActions: string[] = [];
  if (cm.eligibility.status === "ineligible") nextActions.push("You don't meet a mandatory requirement for this listing");
  if (cm.learnNext.length) nextActions.push(`Build or show evidence of ${cm.learnNext.slice(0, 3).join(", ")}`);
  if (met.length && evidence !== "high") nextActions.push("Link projects or experience to your skills to strengthen your evidence");
  for (const m of cm.eligibility.missingInformation) if (!nextActions.includes(m)) nextActions.push(m);

  return {
    score: cm.score,
    completeness: cm.coverage,
    evidence,
    factors: (Object.keys(SCORING.featureWeight) as CanonicalFeature[]).map((k) => ({
      factor: k,
      assessed: cm.features[k] !== null,
      value: cm.features[k] ?? 0,
      note: FEATURE_NOTE[k],
    })),
    matchingSkills: met.map((v) => v.requirement),
    missingRequiredSkills: missingRequired,
    missingPreferredSkills: missingPreferred,
    reasons: cm.explanations.filter((e) => e.kind === "observed").map((e) => e.text).slice(0, 5),
    nextActions: nextActions.slice(0, 5),
    eligibility: cm.eligibility,
    version: cm.version,
    skillVerdicts: cm.skills.map(({ requirement, importance, supportedBy, development }) => ({ requirement, importance, supportedBy, development })),
    explanations: cm.explanations,
    domain: cm.domain,
    relevant: cm.relevant,
    tier: cm.tier,
  };
}

export function canonicalMatch(reg: SkillRegistry, input: MatchInput, opp: OpportunityFacts, now = new Date()): MatchResult {
  const cm = careerMatch(reg, input.facts, input.profile, { ...opp, skills: opp.skills.map((s) => ({ name: s.name, required: s.required, origin: s.origin })) }, { targetRoles: input.targetRoles, now });
  return toMatchResult(cm);
}

/**
 * The student's matcher. Results are remembered per listing for this matcher's lifetime (one request): a page that
 * ranks, recommends and explains the same listings scores each listing once, not once per pass. A matcher lives for
 * one request, so the `now` of its first call stands for the request (passes are milliseconds apart).
 */
export function matcherFor(reg: SkillRegistry, input: MatchInput): Matcher {
  const memo = new WeakMap<OpportunityFacts, MatchResult>();
  return (opp, now) => {
    let r = memo.get(opp);
    if (!r) memo.set(opp, (r = canonicalMatch(reg, input, opp, now)));
    return r;
  };
}
