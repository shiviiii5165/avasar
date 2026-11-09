import { describe, expect, it } from "vitest";

import { matchOpportunity } from "./matching";
import { rankForBrowse, recommend, type Candidate } from "./recommend";
import { describeAnswers, requirementQuestions, unansweredRequirements } from "./requirements";
import type { CandidateFacts, OpportunityFacts } from "./types";

const NOW = new Date("2026-11-06T00:00:00Z");

const cand = (over: Partial<CandidateFacts> = {}): CandidateFacts => ({
  education: [{ level: "bachelors", graduationYear: 2026, field: "Computer Science" }],
  experiences: [{ kind: "full_time", startDate: "2024-01-01", endDate: "2026-01-01", current: false }],
  skills: [{ name: "React", level: "advanced", evidenceCount: 1 }, { name: "TypeScript", level: "intermediate", evidenceCount: 1 }],
  certifications: [],
  city: "Pune", country: "India", workAuthorizedIndia: true,
  preferredLocations: [], workModes: ["hybrid"], preferredRoles: ["frontend"], preferredCategories: ["internship"],
  expectedCompMin: null, compPeriod: null, availableFrom: null,
  ...over,
});

/** A candidate with no data at all (nothing shared from AI Tathastu). */
const empty = (): CandidateFacts => cand({ education: [], experiences: [], skills: [], city: null, country: null, workAuthorizedIndia: null, workModes: [], preferredRoles: [], preferredCategories: [] });

const opp = (over: Partial<OpportunityFacts> = {}): OpportunityFacts => ({
  title: "Frontend Developer Intern", category: "internship", workMode: "hybrid", locations: ["Pune"], country: "India",
  compMin: null, compMax: null, compPeriod: null, unpaid: false, deadline: new Date("2026-12-01T00:00:00Z"), startDate: null,
  experienceMinYears: null, skills: [{ name: "React", required: true }, { name: "TypeScript", required: true }],
  eligibility: null,
  ...over,
});
const elig = (over: Partial<NonNullable<OpportunityFacts["eligibility"]>> = {}): NonNullable<OpportunityFacts["eligibility"]> => ({
  educationLevels: null, graduationYearMin: null, graduationYearMax: null, minExperienceYears: null, requiredCertifications: null, allowedLocations: null, requiresWorkAuthorizationIndia: false, ...over,
});
const item = (id: string, facts: OpportunityFacts): Candidate<string> => ({ id, item: id, facts });
const factor = (c: CandidateFacts, o: OpportunityFacts, f: string) => matchOpportunity(c, o, undefined, NOW).factors.find((x) => x.factor === f)!;

describe("match factors", () => {
  it("skills: full overlap scores higher than partial, and lists matches and gaps", () => {
    const full = factor(cand(), opp(), "skills").value;
    const partial = matchOpportunity(cand({ skills: [{ name: "React", level: null, evidenceCount: 0 }] }), opp(), undefined, NOW);
    expect(full).toBe(1);
    expect(partial.factors.find((f) => f.factor === "skills")!.value).toBeLessThan(1);
    expect(partial.missingRequiredSkills).toEqual(["TypeScript"]);
  });
  it("education: assessed only when the listing has a requirement and the level is known", () => {
    expect(factor(cand(), opp({ eligibility: elig({ educationLevels: ["bachelors"] }) }), "education")).toMatchObject({ assessed: true, value: 1 });
    expect(factor(cand({ education: [{ level: null, graduationYear: 2026, field: null }] }), opp({ eligibility: elig({ educationLevels: ["bachelors"] }) }), "education").assessed).toBe(false);
  });
  it("experience: proportional to the stated minimum", () => {
    expect(factor(cand(), opp({ experienceMinYears: 4 }), "experience").value).toBeCloseTo(0.5, 1);
    expect(factor(cand(), opp({ experienceMinYears: 1 }), "experience").value).toBe(1);
  });
  it("location and work mode: remote always fits; city and mode preferences count", () => {
    expect(factor(cand(), opp({ workMode: "remote", locations: [] }), "location").value).toBe(1);
    expect(factor(cand(), opp({ locations: ["Chennai"] }), "location").value).toBeLessThan(1);
    expect(factor(cand(), opp({ workMode: "onsite" }), "workMode").value).toBe(0);
  });
  it("preferences: category and role keywords", () => {
    expect(factor(cand(), opp(), "preferences").value).toBe(1);
    expect(factor(cand(), opp({ category: "job", title: "Accountant" }), "preferences").value).toBe(0);
  });
  it("explains the match in plain reasons", () => {
    const m = matchOpportunity(cand(), opp(), undefined, NOW);
    expect(m.reasons.join(" ")).toMatch(/React/);
    expect(m.reasons.join(" ")).toMatch(/Located in Pune/);
  });
});

describe("Recommended for You", () => {
  it("never recommends a listing that fails a mandatory requirement, even with a perfect score", () => {
    const strong = opp({ eligibility: elig({ educationLevels: ["masters"] }) }); // perfect skills, wrong degree
    expect(matchOpportunity(cand(), strong, undefined, NOW).score).toBeGreaterThan(50);
    const { picks } = recommend(cand(), [item("hard-fail", strong), item("ok", opp({ title: "Junior Accountant", skills: [{ name: "Excel", required: true }] }))], { now: NOW });
    expect(picks.map((p) => p.id)).toEqual(["ok"]);
  });
  it("unknown eligibility is not a failure: still recommended, ranked by score", () => {
    const needsAuth = opp({ eligibility: elig({ requiresWorkAuthorizationIndia: true }) });
    const { picks } = recommend(cand({ workAuthorizedIndia: null }), [item("unknown", needsAuth), item("weak", opp({ title: "Ops", skills: [{ name: "Excel", required: true }] }))], { now: NOW });
    expect(picks[0].id).toBe("unknown");
    expect(picks[0].match.eligibility.status).not.toBe("ineligible");
    expect(requirementQuestions(picks[0].match.eligibility)).toEqual(["work_authorization"]);
  });
  it("excludes closed and expired listings", () => {
    const expired = opp({ deadline: new Date("2026-11-01T00:00:00Z") });
    expect(recommend(cand(), [item("expired", expired)], { now: NOW }).picks).toEqual([]);
  });
  it("is stable: equal scores order by deadline then id, identically on every call", () => {
    const a = item("b-id", opp({ deadline: new Date("2026-12-10T00:00:00Z") }));
    const b = item("a-id", opp({ deadline: new Date("2026-12-10T00:00:00Z") }));
    const c = item("c-id", opp({ deadline: new Date("2026-11-20T00:00:00Z") }));
    const run = () => recommend(cand(), [a, b, c], { now: NOW }).picks.map((p) => p.id);
    expect(run()).toEqual(["c-id", "a-id", "b-id"]);
    expect(recommend(cand(), [c, b, a], { now: NOW }).picks.map((p) => p.id)).toEqual(run());
  });
  it("flags insufficient profile data instead of implying precision", () => {
    const r = recommend(empty(), [item("x", opp()), item("y", opp({ title: "Analyst" }))], { now: NOW });
    expect(r.limited).toBe(true);
    expect(recommend(cand(), [item("x", opp())], { now: NOW }).limited).toBe(false);
  });
  it("handles an empty opportunity list", () => {
    expect(recommend(cand(), [], { now: NOW })).toEqual({ picks: [], limited: true });
  });
  it("respects the limit and exclusions (already applied)", () => {
    const items = ["1", "2", "3", "4"].map((id) => item(id, opp()));
    expect(recommend(cand(), items, { now: NOW, limit: 2 }).picks).toHaveLength(2);
    expect(recommend(cand(), items, { now: NOW, exclude: new Set(["1", "2", "3"]) }).picks.map((p) => p.id)).toEqual(["4"]);
  });
});

describe("personalized browse order", () => {
  it("keeps every listing visible; failed and closed sink, unknown does not", () => {
    const order = rankForBrowse(cand({ workAuthorizedIndia: null }), [
      item("fail", opp({ eligibility: elig({ educationLevels: ["doctorate"] }) })),
      item("closed", opp({ deadline: new Date("2026-10-01T00:00:00Z") })),
      item("unknown", opp({ eligibility: elig({ requiresWorkAuthorizationIndia: true }) })),
      item("weak", opp({ title: "Ops", skills: [{ name: "Excel", required: true }] })),
    ], NOW).map((r) => r.id);
    expect(order).toHaveLength(4);
    expect(order.slice(0, 2)).toEqual(["unknown", "weak"]);
  });
});

describe("contextual requirement questions", () => {
  it("asks only for unknown mandatory checks, never for passed or failed ones", () => {
    const o = opp({ eligibility: elig({ educationLevels: ["bachelors"], graduationYearMin: 2025, requiresWorkAuthorizationIndia: true }) });
    expect(requirementQuestions(matchOpportunity(cand(), o, undefined, NOW).eligibility)).toEqual([]);
    expect(requirementQuestions(matchOpportunity(empty(), o, undefined, NOW).eligibility).sort()).toEqual(["education", "graduation_year", "work_authorization"]);
    expect(requirementQuestions(matchOpportunity(cand({ workAuthorizedIndia: false }), o, undefined, NOW).eligibility)).toEqual([]);
  });
  it("detects unanswered questions and records answers readably", () => {
    expect(unansweredRequirements(["education", "work_authorization"], { educationLevel: "diploma" })).toEqual(["work_authorization"]);
    expect(describeAnswers(["education", "work_authorization"], { educationLevel: "diploma", workAuthorizedIndia: false }).map((a) => a.answer)).toEqual(["Diploma", "No"]);
  });
});

import { describeDetails, mergeQuestions, parseCategoryDetails } from "./categories";

describe("opportunity categories", () => {
  const form = (o: Record<string, string>) => (k: string) => o[k] ?? null;
  it("enforces each category's own required fields", () => {
    const r = parseCategoryDetails("hackathon", form({ d_format: "online" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["d_eventStart", "d_teamSizeMax"]);
    expect(parseCategoryDetails("job", form({})).ok).toBe(true);
  });
  it("validates types and cross-field rules", () => {
    const bad = parseCategoryDetails("hackathon", form({ d_eventStart: "2026-12-05", d_eventEnd: "2026-12-01", d_format: "online", d_teamSizeMin: "5", d_teamSizeMax: "3" }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toMatchObject({ d_teamSizeMin: expect.any(String), d_eventEnd: expect.any(String) });
    const sch = parseCategoryDetails("scholarship", form({ d_awardAmount: "₹50,000", d_academicRequirement: "CGPA 7+", d_seats: "abc" }));
    expect(sch.ok).toBe(false);
    expect(parseCategoryDetails("startup_program", form({ d_stage: "unicorn", d_benefits: "x" })).ok).toBe(false);
  });
  it("adds category application questions and describes details for the listing page", () => {
    const q = mergeQuestions("hackathon", [{ key: "team_name", label: "dup", required: false }, { key: "motivation", label: "Why?", required: true }]);
    expect(q.map((x) => x.key)).toEqual(["team_name", "team_members", "motivation"]);
    const ok = parseCategoryDetails("scholarship", form({ d_awardAmount: "₹50,000 per year", d_academicRequirement: "70% in Class 12", d_renewable: "on" }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(describeDetails("scholarship", ok.details).map((d) => d.label)).toEqual(["Award amount", "Academic requirement", "Renewable each year"]);
  });
});
