/**
 * Explainable, deterministic matching (relevance). Separate from eligibility.
 *
 *   M = 0.30·Skills + 0.20·Education + 0.15·Experience + 0.15·Location + 0.10·WorkMode + 0.10·Preferences
 *
 * The weights are configurable starting hypotheses, NOT validated values (docs/DECISIONS.md D-07).
 * A factor counts only when both sides have the data it needs; the score is the weighted mean over
 * assessed factors, and `completeness` says how much of the formula could be assessed. Missing data
 * therefore lowers confidence, not the score. Protected characteristics are never inputs.
 */
import { evaluateEligibility, experienceYears, type EligibilityResult } from "./eligibility";
import { normalizeSkill } from "./skills";
import type { CandidateFacts, OpportunityFacts } from "./types";

export type Factor = "skills" | "education" | "experience" | "location" | "workMode" | "preferences";
export const DEFAULT_WEIGHTS: Record<Factor, number> = { skills: 0.3, education: 0.2, experience: 0.15, location: 0.15, workMode: 0.1, preferences: 0.1 };

export interface FactorResult { factor: Factor; assessed: boolean; value: number; note: string }

export interface MatchResult {
  /** 0-100 relative relevance over assessed factors. Not a probability of being hired. */
  score: number | null;
  /** Share (0-1) of the formula's weight that could be assessed with the data available. */
  completeness: number;
  /** How well the matched skills are backed by evidence (projects, roles, certificates): low | medium | high. */
  evidence: "low" | "medium" | "high" | "none";
  factors: FactorResult[];
  matchingSkills: string[];
  missingRequiredSkills: string[];
  missingPreferredSkills: string[];
  reasons: string[];
  nextActions: string[];
  eligibility: EligibilityResult;
}

const lc = (s: string) => s.trim().toLowerCase();

export function matchOpportunity(candidate: CandidateFacts, opp: OpportunityFacts, weights = DEFAULT_WEIGHTS, now = new Date()): MatchResult {
  const factors: FactorResult[] = [];
  const reasons: string[] = [];
  const nextActions: string[] = [];

  // Skills: required count double; credit scaled by level when given.
  const have = new Map(candidate.skills.map((s) => [normalizeSkill(s.name), s]));
  const matching: string[] = [];
  const missingReq: string[] = [];
  const missingPref: string[] = [];
  let earned = 0;
  let possible = 0;
  for (const s of opp.skills) {
    const w = s.required ? 2 : 1;
    possible += w;
    const mine = have.get(normalizeSkill(s.name));
    if (mine) {
      matching.push(s.name);
      const levelCredit = mine.level === "beginner" ? 0.7 : 1;
      earned += w * levelCredit;
    } else (s.required ? missingReq : missingPref).push(s.name);
  }
  if (opp.skills.length && candidate.skills.length) {
    factors.push({ factor: "skills", assessed: true, value: earned / possible, note: `${matching.length} of ${opp.skills.length} listed skills` });
    if (matching.length) reasons.push(`You have ${matching.slice(0, 4).join(", ")}${matching.length > 4 ? ` and ${matching.length - 4} more` : ""}`);
    if (missingReq.length) nextActions.push(`Build or show evidence of ${missingReq.slice(0, 3).join(", ")}`);
  } else {
    factors.push({ factor: "skills", assessed: false, value: 0, note: candidate.skills.length ? "This listing names no skills" : "Add your skills" });
    if (!candidate.skills.length) nextActions.push("Add your skills to see how you match");
  }

  // Education: uses the eligibility requirement when present; otherwise any education is neutral-positive.
  const elig = evaluateEligibility(candidate, opp, now);
  const eduCheck = elig.checks.find((c) => c.key === "education");
  if (eduCheck && eduCheck.outcome !== "unknown") {
    factors.push({ factor: "education", assessed: true, value: eduCheck.outcome === "pass" ? 1 : 0, note: eduCheck.detail });
    if (eduCheck.outcome === "pass") reasons.push("Your education meets the requirement");
  } else {
    factors.push({ factor: "education", assessed: false, value: 0, note: candidate.education.length ? "No education requirement" : "Add your education" });
  }

  // Experience: proximity to the stated minimum (no minimum = not assessed).
  const minExp = opp.eligibility?.minExperienceYears ?? opp.experienceMinYears;
  const yrs = experienceYears(candidate.experiences, now);
  if (minExp !== null && minExp !== undefined && yrs !== null) {
    const value = minExp === 0 ? 1 : Math.min(1, yrs / minExp);
    factors.push({ factor: "experience", assessed: true, value, note: `${yrs} yrs vs ${minExp}+ expected` });
    if (value >= 1 && minExp > 0) reasons.push(`Your ${yrs} years of experience meet the expectation`);
  } else {
    factors.push({ factor: "experience", assessed: false, value: 0, note: yrs === null ? "Add your experience" : "No experience expectation" });
  }

  // Location: remote always fits; otherwise city/preferred locations vs listing locations.
  const myPlaces = [candidate.city, ...candidate.preferredLocations].filter(Boolean).map((s) => lc(s!));
  if (opp.workMode === "remote") {
    factors.push({ factor: "location", assessed: true, value: 1, note: "Remote" });
  } else if (opp.locations.length && myPlaces.length) {
    const ok = opp.locations.some((l) => myPlaces.includes(lc(l)));
    factors.push({ factor: "location", assessed: true, value: ok ? 1 : 0.2, note: ok ? "In your city or preferred locations" : `Located in ${opp.locations.join(", ")}` });
    if (ok) reasons.push(`Located in ${opp.locations.find((l) => myPlaces.includes(lc(l)))}`);
  } else {
    factors.push({ factor: "location", assessed: false, value: 0, note: "Add your preferred locations" });
  }

  // Work mode preference.
  if (candidate.workModes.length) {
    const ok = candidate.workModes.includes(opp.workMode);
    factors.push({ factor: "workMode", assessed: true, value: ok ? 1 : 0, note: ok ? `${opp.workMode} matches your preference` : `${opp.workMode}, not one you prefer` });
    if (ok) reasons.push(`${opp.workMode[0].toUpperCase()}${opp.workMode.slice(1)} matches your preference`);
  } else factors.push({ factor: "workMode", assessed: false, value: 0, note: "Set your work-mode preference" });

  // Preferences: category, role keywords and compensation expectation.
  const prefParts: number[] = [];
  if (candidate.preferredCategories.length) prefParts.push(candidate.preferredCategories.includes(opp.category) ? 1 : 0);
  if (candidate.preferredRoles.length) {
    const title = lc(opp.title);
    prefParts.push(candidate.preferredRoles.some((r) => r && title.includes(lc(r))) ? 1 : 0);
  }
  if (candidate.expectedCompMin !== null && !opp.unpaid && (opp.compMax ?? opp.compMin) !== null && (!candidate.compPeriod || candidate.compPeriod === opp.compPeriod)) {
    prefParts.push((opp.compMax ?? opp.compMin)! >= candidate.expectedCompMin ? 1 : 0);
  }
  if (prefParts.length) {
    const value = prefParts.reduce((a, b) => a + b, 0) / prefParts.length;
    factors.push({ factor: "preferences", assessed: true, value, note: value === 1 ? "Matches your stated preferences" : "Partly matches your preferences" });
  } else factors.push({ factor: "preferences", assessed: false, value: 0, note: "Set your career preferences" });

  const assessed = factors.filter((f) => f.assessed);
  const assessedWeight = assessed.reduce((s, f) => s + weights[f.factor], 0);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const score = assessedWeight ? Math.round((assessed.reduce((s, f) => s + weights[f.factor] * f.value, 0) / assessedWeight) * 100) : null;

  const backed = matching.map((m) => have.get(normalizeSkill(m))!).filter((s) => s.evidenceCount > 0).length;
  const evidence = !matching.length ? "none" : backed / matching.length >= 0.66 ? "high" : backed > 0 ? "medium" : "low";
  if (matching.length && evidence !== "high") nextActions.push("Link projects or experience to your skills to strengthen your evidence");

  for (const m of elig.missingInformation) if (!nextActions.includes(m)) nextActions.push(m);
  if (elig.status === "ineligible") nextActions.unshift("You don't meet a mandatory requirement for this listing");

  return {
    score,
    completeness: Math.round((assessedWeight / totalWeight) * 100) / 100,
    evidence,
    factors,
    matchingSkills: matching,
    missingRequiredSkills: missingReq,
    missingPreferredSkills: missingPref,
    reasons,
    nextActions: nextActions.slice(0, 5),
    eligibility: elig,
  };
}
