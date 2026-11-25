import { describe, expect, it } from "vitest";

import { rankForBrowse, recommend } from "../domain/recommend";
import type { CandidateFacts, OpportunityFacts } from "../domain/types";
import { matcherFor } from "./canonical-match";
import { inferTargetRole, isSpecificSkill } from "./career-match";
import { buildSkillProfile, type EvidenceItem } from "./evidence";
import { curatedRegistry } from "./registry";

/**
 * Profile-driven relevance across domains, with the canonical matcher (career-match/v2 + relevance gate).
 * Each synthetic student must see their own field near the top, and never a listing that shares only generic skills
 * (Excel, communication) in their recommendations.
 */
const reg = curatedRegistry();
const NOW = new Date("2026-11-26T00:00:00Z");
const facts: CandidateFacts = {
  education: [{ level: "bachelors", graduationYear: 2026, field: null }],
  experiences: [], skills: [], certifications: [], city: "Pune", country: "India", workAuthorizedIndia: true,
  preferredLocations: [], workModes: [], preferredRoles: [], preferredCategories: [], expectedCompMin: null, compPeriod: null, availableFrom: null,
};
type L = { id: string; title: string; skills: [string, boolean][] };
const LISTINGS: L[] = [
  { id: "ml", title: "Machine Learning Intern", skills: [["Python", true], ["Machine Learning", true], ["PyTorch", false]] },
  { id: "ai", title: "AI Engineer Intern", skills: [["Python", true], ["Deep learning", true]] },
  { id: "ds", title: "Data Science Intern", skills: [["Python", true], ["Statistics", true], ["Pandas", false]] },
  { id: "nlp", title: "NLP Research Intern", skills: [["Python", true], ["NLP", true]] },
  { id: "ba", title: "Business Analyst Intern", skills: [["Excel", true], ["SQL", true], ["Requirements gathering", true]] },
  { id: "ops-generic", title: "Operations Executive", skills: [["Excel", true], ["Communication", true]] },
  { id: "support-generic", title: "Customer Support Executive", skills: [["Communication", true], ["Excel", false]] },
  { id: "mkt", title: "Digital Marketing Intern", skills: [["SEO", true], ["Social media management", true], ["Communication", false]] },
  { id: "fin", title: "Financial Analyst Intern", skills: [["Financial modelling", true], ["Excel", true], ["Accounting", false]] },
  { id: "ux", title: "UI/UX Design Intern", skills: [["Figma", true], ["User research", true]] },
  { id: "hr", title: "HR Intern", skills: [["Recruitment", true], ["Communication", false]] },
  { id: "mech", title: "Mechanical Design Trainee", skills: [["AutoCAD", true], ["SolidWorks", true]] },
  { id: "civil", title: "Civil Site Engineer", skills: [["AutoCAD", true], ["STAAD.Pro", true]] },
];
const opp = (l: L): OpportunityFacts => ({
  title: l.title, category: "internship", workMode: "remote", locations: [], country: "India", compMin: null, compMax: null, compPeriod: null,
  unpaid: false, deadline: null, startDate: null, experienceMinYears: null, eligibility: null,
  skills: l.skills.map(([name, required]) => ({ name, required })),
} as OpportunityFacts);
const candidates = LISTINGS.map((l) => ({ id: l.id, item: l, facts: opp(l) }));
const ev = (skillName: string, type: EvidenceItem["type"] = "declared", extra: Partial<EvidenceItem> = {}): EvidenceItem => ({ skillName, type, ref: null, label: skillName, observedAt: new Date("2026-10-01"), verification: "unverified", provenance: "avsar", ...extra });

function student(goal: string | null, skills: string[], project: string[] = []) {
  const items = [...skills.map((s) => ev(s)), ...project.map((s) => ev(s, "project", { ref: "p1", label: "Capstone" }))];
  const profile = buildSkillProfile(items, reg, { now: NOW });
  return matcherFor(reg, { facts, profile, targetRoles: goal ? [goal] : [] });
}

const PROFILES: { name: string; goal: string; skills: string[]; project?: string[]; expectTop: string[]; neverRecommend: string[] }[] = [
  { name: "Machine Learning Engineer", goal: "Machine learning engineer", skills: ["Excel", "Communication"], project: ["Python", "Machine Learning"], expectTop: ["ml", "ai"], neverRecommend: ["ops-generic", "support-generic", "mech"] },
  { name: "Business Analyst", goal: "Business analyst", skills: ["Excel", "SQL", "Requirements gathering", "Communication"], expectTop: ["ba"], neverRecommend: ["support-generic", "mech", "ux"] },
  { name: "Marketing", goal: "Digital marketing executive", skills: ["SEO", "Social media management", "Communication", "Excel"], expectTop: ["mkt"], neverRecommend: ["ops-generic", "support-generic", "ml"] },
  { name: "Finance", goal: "Financial analyst", skills: ["Excel", "Accounting", "Financial modelling"], expectTop: ["fin"], neverRecommend: ["ops-generic", "support-generic", "ux"] },
  { name: "UI/UX Design", goal: "UI/UX designer", skills: ["Figma", "User research", "Communication"], expectTop: ["ux"], neverRecommend: ["ops-generic", "support-generic", "fin"] },
  { name: "HR", goal: "HR executive", skills: ["Recruitment", "Communication", "Excel"], expectTop: ["hr"], neverRecommend: ["ops-generic", "ml", "mech"] },
  { name: "Mechanical Engineering", goal: "Mechanical engineer trainee", skills: ["AutoCAD", "SolidWorks", "Excel"], expectTop: ["mech"], neverRecommend: ["ops-generic", "support-generic", "mkt"] },
  { name: "Civil Engineering", goal: "Civil engineer", skills: ["AutoCAD", "STAAD.Pro"], expectTop: ["civil"], neverRecommend: ["ops-generic", "support-generic", "ux"] },
];

describe("profile-driven relevance", () => {
  for (const p of PROFILES) {
    describe(p.name, () => {
      const m = student(p.goal, p.skills, p.project);
      const recs = recommend(m, candidates, { now: NOW, limit: 3 }).picks.map((r) => r.id);
      const browse = rankForBrowse(m, candidates, NOW).map((r) => r.id);

      it("puts the student's own field near the top", () => {
        for (const id of p.expectTop) expect(recs, `${id} in ${recs}`).toContain(id);
      });
      it("never recommends a listing that only shares generic skills or is unrelated", () => {
        for (const id of p.neverRecommend) expect(recs).not.toContain(id);
        for (const id of recs) expect(m(opp(LISTINGS.find((l) => l.id === id)!), NOW).relevant).toBe(true);
      });
      it("browsing keeps everything visible but ranks off-target listings after relevant ones", () => {
        expect(browse).toHaveLength(LISTINGS.length);
        const firstOff = browse.findIndex((id) => m(opp(LISTINGS.find((l) => l.id === id)!), NOW).relevant === false);
        const lastOn = browse.map((id) => m(opp(LISTINGS.find((l) => l.id === id)!), NOW).relevant).lastIndexOf(true);
        if (firstOff >= 0) expect(lastOn).toBeLessThan(firstOff);
      });
    });
  }

  it("AI/ML: generic-only listings are off-target even though the student has Excel and communication", () => {
    const m = student("Machine learning engineer", ["Excel", "Communication"], ["Python", "Machine Learning"]);
    for (const id of ["ops-generic", "support-generic"]) expect(m(opp(LISTINGS.find((l) => l.id === id)!), NOW).relevant).toBe(false);
    for (const id of ["ml", "ai", "ds", "nlp"]) expect(m(opp(LISTINGS.find((l) => l.id === id)!), NOW).relevant).toBe(true);
  });

  it("incomplete profile: missing evidence is not a negative skill, and nothing is hidden for lack of data", () => {
    const empty = student(null, []);
    const r = recommend(empty, candidates, { now: NOW, limit: 3 });
    expect(r.limited).toBe(true); // the page says these are general picks
    for (const l of LISTINGS) {
      const res = empty(opp(l), NOW);
      expect(res.relevant).toBe(true);
      expect(res.eligibility.status).not.toBe("ineligible");
    }
    const genericOnly = student(null, ["Excel", "Communication"]);
    expect(genericOnly(opp(LISTINGS[0]), NOW).relevant).toBe(true); // no target and nothing specific to judge by
  });

  it("soft skills written as text are generic; unusual exact skills are specific", () => {
    expect(isSpecificSkill(reg, reg.key("Communication"))).toBe(false);
    expect(isSpecificSkill(reg, reg.key("Teamwork"))).toBe(false);
    expect(isSpecificSkill(reg, reg.key("Excel"))).toBe(false);
    expect(isSpecificSkill(reg, reg.key("Python"))).toBe(true);
    expect(isSpecificSkill(reg, reg.key("Drone surveying"))).toBe(true);
  });
});

describe("target role worked out from evidence (no goal stated)", () => {
  it("infers a role only when the evidence clearly covers its essentials", () => {
    const ml = buildSkillProfile(["Python", "Machine Learning", "Statistics"].map((s) => ev(s, "project", { ref: "p" })), reg, { now: NOW });
    expect(inferTargetRole(reg, ml)?.id).toBeTruthy();
    expect(reg.roles.find((r) => r.id === inferTargetRole(reg, ml)!.id)!.domain).toMatch(/ai_ml|data_science/);
    expect(inferTargetRole(reg, buildSkillProfile([ev("Excel"), ev("Communication")], reg, { now: NOW }))).toBeNull();
    // Only studying a topic is not evidence of the skill.
    expect(inferTargetRole(reg, buildSkillProfile([ev("Python", "ait_learning"), ev("Machine Learning", "ait_learning")], reg, { now: NOW }))).toBeNull();
  });
});
