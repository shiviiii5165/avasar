import { describe, expect, it } from "vitest";

import { recommend, rankForBrowse } from "../domain/recommend";
import type { CandidateFacts, OpportunityFacts } from "../domain/types";
import { matcherFor, canonicalMatch } from "./canonical-match";
import { careerMatch, rankCareerMatches } from "./career-match";
import { buildSkillProfile, type EvidenceItem } from "./evidence";
import { curatedRegistry } from "./registry";

const reg = curatedRegistry();
const NOW = new Date("2026-11-24T00:00:00Z");
const facts: CandidateFacts = {
  education: [{ level: "bachelors", graduationYear: 2026, field: "Computer Science" }],
  experiences: [], skills: [{ name: "SQL", level: null, evidenceCount: 1 }, { name: "Python", level: null, evidenceCount: 0 }], certifications: [],
  city: "Pune", country: "India", workAuthorizedIndia: true,
  preferredLocations: [], workModes: ["remote"], preferredRoles: ["Data analyst"], preferredCategories: [], expectedCompMin: null, compPeriod: null, availableFrom: null,
};
const ev = (skillName: string, type: EvidenceItem["type"]): EvidenceItem => ({ skillName, type, ref: null, label: skillName, observedAt: new Date("2026-11-20T00:00:00Z"), verification: "unverified", provenance: "avsar" });
const profile = buildSkillProfile([ev("SQL", "project"), ev("Python", "declared")], reg, { now: NOW });
const input = { facts, profile, targetRoles: ["Data analyst"] };

const listing = (id: string, skills: OpportunityFacts["skills"], over: Partial<OpportunityFacts> = {}) => ({
  id,
  facts: { title: "Data analyst", category: "job", workMode: "remote", locations: [], country: "India", compMin: null, compMax: null, compPeriod: null, unpaid: false, deadline: null, startDate: null, experienceMinYears: null, eligibility: null, skills, ...over } as OpportunityFacts,
});
const LISTINGS = [
  listing("a", [{ name: "SQL", required: true }, { name: "Power BI", required: false }]),
  listing("b", [{ name: "Python", required: true }, { name: "Tableau", required: true }]),
  listing("c", [{ name: "Kubernetes", required: true }], { title: "DevOps engineer" }),
  listing("d", [{ name: "SQL", required: false, origin: "text_mentioned" }]),
  listing("e", []),
];

describe("one canonical matcher", () => {
  it("gives every page the same score as the career page for the same listing", () => {
    const match = matcherFor(reg, input);
    for (const l of LISTINGS) {
      const career = careerMatch(reg, facts, profile, l.facts, { targetRoles: input.targetRoles, now: NOW });
      const page = match(l.facts, NOW);
      expect(page.score, l.id).toBe(career.score);
      expect(page.eligibility.status, l.id).toBe(career.eligibility.status);
      expect(page.version).toBe("career-match/v1");
    }
  });

  it("recommendations and browse order agree with career ranking", () => {
    const match = matcherFor(reg, input);
    const asCandidates = LISTINGS.map((l) => ({ id: l.id, item: l.id, facts: l.facts }));
    const career = rankCareerMatches(LISTINGS.map((l) => ({ id: l.id, deadline: null, match: careerMatch(reg, facts, profile, l.facts, { targetRoles: input.targetRoles, now: NOW }) })), 3).map((x) => x.id);
    expect(recommend(match, asCandidates, { now: NOW }).picks.map((p) => p.id)).toEqual(career);
    expect(rankForBrowse(match, asCandidates, NOW).slice(0, 3).map((r) => r.id)).toEqual(career);
  });

  it("is deterministic and keeps missing, unknown and inferred distinct", () => {
    const one = canonicalMatch(reg, input, LISTINGS[1]!.facts, NOW);
    expect(canonicalMatch(reg, input, LISTINGS[1]!.facts, NOW)).toEqual(one);
    expect(one.missingRequiredSkills).toEqual(["Tableau"]);
    const mentioned = canonicalMatch(reg, input, LISTINGS[3]!.facts, NOW);
    expect(mentioned.skillVerdicts![0]!.importance).toBe("mentioned");
    expect(mentioned.missingRequiredSkills).toEqual([]);
    const none = canonicalMatch(reg, input, LISTINGS[4]!.facts, NOW);
    expect(none.explanations!.some((e) => e.kind === "unknown")).toBe(true);
  });

  it("never claims evidence it does not have", () => {
    const declaredOnly = canonicalMatch(reg, { ...input, profile: buildSkillProfile([ev("Python", "declared")], reg, { now: NOW }) }, LISTINGS[1]!.facts, NOW);
    expect(declaredOnly.evidence).toBe("low");
    const empty = canonicalMatch(reg, { ...input, profile: [] }, LISTINGS[0]!.facts, NOW);
    expect(empty.score).toBeNull();
    expect(empty.evidence).toBe("none");
  });
});

describe("skills inferred from descriptions", () => {
  it("can't be used to inflate a match by stuffing skill names into a description", () => {
    const honest = canonicalMatch(reg, input, listing("h", [{ name: "SQL", required: false, origin: "text_mentioned" }, { name: "Power BI", required: false, origin: "text_mentioned" }]).facts, NOW);
    const stuffedSkills = ["SQL", "Power BI", "Docker", "Kubernetes", "Java", "Go", "Rust", "React", "Angular", "AWS", "Azure", "Tableau"].map((name) => ({ name, required: false, origin: "text_mentioned" as const }));
    const stuffed = canonicalMatch(reg, input, listing("s", stuffedSkills).facts, NOW);
    expect(stuffed.score!).toBeLessThan(honest.score!);
  });

  it("are labelled as inferred and never reported as a missing required skill", () => {
    const m = canonicalMatch(reg, input, listing("m", [{ name: "Kubernetes", required: true, origin: "text_mentioned" }]).facts, NOW);
    expect(m.skillVerdicts![0]!.importance).toBe("mentioned");
    expect(m.missingRequiredSkills).toEqual([]);
  });
});
