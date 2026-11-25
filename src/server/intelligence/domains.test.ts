import { describe, expect, it } from "vitest";

import type { MatchResult } from "../domain/matching";
import { diversify } from "../domain/recommend";
import type { CandidateFacts, OpportunityFacts } from "../domain/types";
import { careerMatch, SCORING } from "./career-match";
import { classifyOpportunity, DOMAINS, domainDef, domainRelation, searchIntent } from "./domains";
import { buildSkillProfile, type EvidenceItem } from "./evidence";
import { evaluateDomains } from "./eval/evaluate";
import { curatedRegistry } from "./registry";
import { ROLES } from "./registry-data";

const reg = curatedRegistry();
const NOW = new Date("2026-11-24T00:00:00Z");
const opp = (title: string, skills: [string, boolean][] = [], over: Partial<OpportunityFacts> = {}) => ({
  title, category: "internship", workMode: "remote" as const, locations: [], country: "India", compMin: null, compMax: null, compPeriod: null, unpaid: false,
  deadline: new Date("2027-02-01"), startDate: null, experienceMinYears: null, eligibility: null, ...over,
  skills: skills.map(([name, required]) => ({ name, required, origin: "listed" as const })),
});
const facts: CandidateFacts = {
  education: [{ level: "bachelors", graduationYear: 2026, field: null }], experiences: [], skills: [], certifications: [], city: null, country: "India",
  workAuthorizedIndia: null, preferredLocations: [], workModes: [], preferredRoles: [], preferredCategories: [], expectedCompMin: null, compPeriod: null, availableFrom: null,
};
const ev = (skillName: string): EvidenceItem => ({ skillName, type: "project", ref: null, label: skillName, observedAt: NOW, verification: "unverified", provenance: "avsar" });

describe("registry and domain integrity", () => {
  it("every role survives registry construction (all its skills exist) and points to a known domain", () => {
    expect(reg.roles.map((r) => r.id).sort()).toEqual(ROLES.map((r) => r.id).sort());
    for (const r of ROLES) expect(domainDef(r.domain), r.id).toBeDefined();
  });
  it("every domain has at least one role, so each can be classified from a title", () => {
    for (const d of DOMAINS) expect(ROLES.some((r) => r.domain === d.id), d.id).toBe(true);
  });
  it("role ids from before domains were added still resolve (stored target roles keep working)", () => {
    for (const id of ["frontend_developer", "data_analyst", "ml_engineer", "accountant", "digital_marketer", "ux_designer", "fitter_apprentice", "mechanical_trainee"]) {
      expect(reg.roles.some((r) => r.id === id), id).toBe(true);
    }
  });
});

describe("classifyOpportunity", () => {
  it.each([
    ["Business Analyst Intern", "business_analysis"],
    ["Summer Marketing Internship 2027", "digital_marketing"],
    ["HR Intern", "human_resources"],
    ["Machine Learning Intern", "ai_ml"],
    ["Graphic Design Intern", "graphic_design"],
    ["Equity Research Intern", "investment_research"],
    ["Policy Research Intern", "public_policy"],
    ["Trade Apprentice Fitter", "skilled_trades"],
  ])("%s → %s (from the title, high confidence)", (title, domain) => {
    const c = classifyOpportunity(reg, opp(title));
    expect(c).toMatchObject({ domain, basis: "title", confidence: "high" });
  });

  it("a business analyst is no longer filed under data analytics", () => {
    expect(classifyOpportunity(reg, opp("Business Analyst")).domain).toBe("business_analysis");
    expect(classifyOpportunity(reg, opp("Data Analyst")).domain).toBe("data_analytics");
  });

  it("falls back to the listed skills when the title names no role, and says so", () => {
    const c = classifyOpportunity(reg, opp("Intern – Growth Team", [["Digital marketing", true], ["SEO", true], ["Google Ads", false]]));
    expect(c).toMatchObject({ domain: "digital_marketing", basis: "skills" });
  });

  it("never guesses: a vague title with generic skills has no field", () => {
    expect(classifyOpportunity(reg, opp("Summer Internship 2027", [["Excel", false], ["English communication", false]]))).toMatchObject({ domain: null, basis: "unknown", confidence: "none" });
  });

  it("skills merely mentioned in a description don't decide the field", () => {
    const o = { ...opp("Intern"), skills: [{ name: "Python", required: false, origin: "text_mentioned" as const }, { name: "Machine learning", required: false, origin: "text_mentioned" as const }] };
    expect(classifyOpportunity(reg, o).domain).toBeNull();
  });
});

describe("searchIntent", () => {
  it.each([
    ["BA internship", "business_analyst"],
    ["ML intern", "ml_engineer"],
    ["marketing internship", "digital_marketer"],
    ["HR intern", "hr_recruiter"],
    ["ui ux intern", "ux_designer"],
  ])("“%s” → %s", (q, roleId) => expect(searchIntent(reg, q)?.roleId).toBe(roleId));

  it("short words only match as whole words (“ai” is not found inside “Mumbai”, “ba” not inside “MBA”)", () => {
    expect(searchIntent(reg, "Mumbai")).toBeNull();
    expect(reg.roleFor("MBA Intern")?.id).not.toBe("business_analyst");
  });
  it("an organization name is plain text search", () => expect(searchIntent(reg, "Acme Corp")).toBeNull());
});

describe("domain-aware career match (career-match/v2)", () => {
  const marketing = buildSkillProfile([ev("Digital marketing"), ev("Social media"), ev("Excel")], reg, { now: NOW });
  const target = { targetRoles: ["Digital Marketing Executive"], now: NOW };

  it("relation and credit by field: role > same field > nearby > other", () => {
    const rel = (title: string, skills: [string, boolean][] = []) => careerMatch(reg, facts, marketing, opp(title, skills), target).domain.relation;
    expect(rel("Digital Marketing Executive")).toBe("role");
    expect(rel("Social Media Intern")).toBe("adjacent");
    expect(rel("Brand Associate")).toBe("adjacent");
    expect(rel("Sales Intern")).toBe("group");
    expect(rel("Machine Learning Intern")).toBe("none");
    expect(domainRelation("finance", "finance")).toBe("same");
  });

  it("a marketing student's marketing listing outranks an ML listing that shares a generic skill", () => {
    const mk = careerMatch(reg, facts, marketing, opp("Marketing Intern", [["Digital marketing", true], ["Excel", false]]), target);
    const ml = careerMatch(reg, facts, marketing, opp("Machine Learning Intern", [["Excel", true]]), target);
    expect(mk.score!).toBeGreaterThan(ml.score!);
  });

  it("a vague listing with no stated field can't outrank one in the student's field on generic skills alone", () => {
    const vague = careerMatch(reg, facts, marketing, opp("Summer Internship 2027", [["Excel", false]]), target);
    const inField = careerMatch(reg, facts, marketing, opp("Marketing Intern", [["Digital marketing", true], ["SEO", false]]), target);
    expect(vague.features.roleAlignment).toBe(SCORING.unknownFieldCredit);
    expect(vague.explanations.some((e) => e.kind === "unknown" && /doesn't say which field/.test(e.text))).toBe(true);
    expect(inField.score!).toBeGreaterThan(vague.score!);
  });

  it("without a target role, the field is not assessed and nothing is assumed about the student", () => {
    const m = careerMatch(reg, facts, marketing, opp("Summer Internship 2027", [["Excel", false]]), { now: NOW });
    expect(m.features.roleAlignment).toBeNull();
    expect(m.domain.relation).toBeNull();
  });

  it("closed listings stay excluded whatever their field", () => {
    const m = careerMatch(reg, facts, marketing, opp("Marketing Intern", [["Digital marketing", true]], { deadline: new Date("2026-10-01") }), target);
    expect(m.excluded).toBe(true);
  });
});

describe("diversify", () => {
  const r = (id: string, score: number, field: string | null) => ({ id, match: { score, domain: field ? { id: field } : undefined } as unknown as MatchResult });
  it("caps one field at ⌈2/3⌉ of the picks when another field is within the margin", () => {
    const out = diversify([r("a", 90, "ai_ml"), r("b", 88, "ai_ml"), r("c", 86, "ai_ml"), r("d", 80, "data_science")], 3).map((x) => x.id);
    expect(out).toEqual(["a", "b", "d"]);
  });
  it("keeps score order when the alternative is far behind (relevance beats variety)", () => {
    const out = diversify([r("a", 90, "ai_ml"), r("b", 88, "ai_ml"), r("c", 86, "ai_ml"), r("d", 40, "sales")], 3).map((x) => x.id);
    expect(out).toEqual(["a", "b", "c"]);
  });
  it("never caps listings whose field is unknown", () => {
    expect(diversify([r("a", 90, null), r("b", 89, null), r("c", 88, null), r("d", 87, "sales")], 3).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("cross-domain evaluation (synthetic) — guards against regressions, not proof of real-world quality", () => {
  const report = evaluateDomains();
  it("classifies every hand-labelled listing and every search phrase correctly", () => {
    expect(report.classification.errors).toEqual([]);
    expect(report.searchIntent.errors).toEqual([]);
  });
  it("puts a listing from the student's own field first for every domain student", () => {
    for (const s of report.perStudent) expect(s[`precision@3`], s.student).toBeGreaterThanOrEqual(0.66);
  });
  it("beats the keyword baseline on nDCG@3 and recommends nothing closed", () => {
    expect(report.summary["ndcg@3"]!).toBeGreaterThan(report.lexicalBaseline["ndcg@3"]!);
    expect(report.summary.closedInTop5).toBe(0);
  });
});
