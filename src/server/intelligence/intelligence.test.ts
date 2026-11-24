import { describe, expect, it } from "vitest";

import type { CandidateFacts, OpportunityFacts } from "../domain/types";
import { careerMatch, rankCareerMatches, roleReadiness, SCORING, type ListingSkill } from "./career-match";
import { buildSkillProfile, collectEvidence, type EvidenceInputs, type EvidenceItem } from "./evidence";
import { curatedRegistry } from "./registry";

const reg = curatedRegistry();
const NOW = new Date("2026-11-24T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const facts = (over: Partial<CandidateFacts> = {}): CandidateFacts => ({
  education: [{ level: "bachelors", graduationYear: 2026, field: "Computer Science" }],
  experiences: [], skills: [], certifications: [], city: "Pune", country: "India", workAuthorizedIndia: true,
  preferredLocations: [], workModes: [], preferredRoles: [], preferredCategories: [], expectedCompMin: null, compPeriod: null, availableFrom: null, ...over,
});
const opp = (skills: ListingSkill[], over: Partial<OpportunityFacts> = {}): OpportunityFacts & { skills: ListingSkill[] } => ({
  title: "Data analyst", category: "job", workMode: "remote", locations: [], country: "India", compMin: null, compMax: null, compPeriod: null,
  unpaid: false, deadline: null, startDate: null, experienceMinYears: null, eligibility: null, ...over, skills,
});
const ev = (skillName: string, type: EvidenceItem["type"], extra: Partial<EvidenceItem> = {}): EvidenceItem => ({ skillName, type, ref: null, label: skillName, observedAt: daysAgo(5), verification: "unverified", provenance: "avsar", ...extra });

describe("skill registry", () => {
  it("resolves synonyms to one concept and keeps unknown skills as text", () => {
    expect(reg.resolve("ReactJS")).toBe("react");
    expect(reg.resolve("React.js")).toBe("react");
    expect(reg.resolve("Tally ERP 9")).toBe("tally");
    expect(reg.resolve("PostgreSQL")).toBe("postgres");
    expect(reg.resolve("Underwater basket weaving")).toBeNull();
    expect(reg.key("Underwater basket weaving")).toBe("text:underwater basket weaving");
  });
  it("specialization counts one way only; related is a separate, weaker relation", () => {
    expect(reg.relation("postgres", "sql")).toBe("specialization");
    expect(reg.relation("sql", "postgres")).toBe("none");
    expect(reg.relation("pytorch", "tensorflow")).toBe("related");
    expect(reg.relation("python", "java")).toBe("none");
  });
  it("finds skills in free text only as whole words and never ambiguous ones", () => {
    expect(reg.mentionedIn("Strong SQL and Power BI skills; Python a plus")).toEqual(["powerbi", "python", "sql"]);
    expect(reg.mentionedIn("Spring internship for the rest of the team; excellent attitude")).toEqual([]);
    expect(reg.mentionedIn("Experience with Go and R")).toEqual([]);
  });
  it("maps Indian role titles to target roles", () => {
    expect(reg.roleFor("Accounts Executive")?.id).toBe("accountant");
    expect(reg.roleFor("Trade Apprentice Fitter - NATS")?.id).toBe("fitter_apprentice");
  });
});

describe("skill evidence and states", () => {
  it("asking about a topic is never practice or proficiency", () => {
    const p = buildSkillProfile([ev("SQL", "ait_learning", { provenance: "ai_tathastu" })], reg, { now: NOW });
    expect(p[0].state).toBe("learning");
    const old = buildSkillProfile([ev("SQL", "ait_learning", { observedAt: daysAgo(400) })], reg, { now: NOW });
    expect(old[0].state).toBe("declared");
  });
  it("a verified project outranks a self-declared skill", () => {
    const p = buildSkillProfile([ev("Python", "declared"), ev("python", "ait_project", { verification: "verified", provenance: "ai_tathastu" })], reg, { now: NOW });
    expect(p).toHaveLength(1);
    expect(p[0].state).toBe("verified");
    expect(p[0].evidence).toHaveLength(2);
  });
  it("derives each state from its rule", () => {
    const p = buildSkillProfile([ev("Excel", "declared"), ev("Pandas", "project"), ev("Power BI", "ait_practice")], reg, { now: NOW });
    const st = Object.fromEntries(p.map((e) => [e.conceptId, e.state]));
    expect(st).toEqual({ excel: "declared", pandas: "demonstrated", powerbi: "practiced" });
  });
  it("reports improvement only from comparable assessments", () => {
    const a = (score: number, d: number) => ev("SQL", "assessment", { result: { score, maxScore: 50, passed: score >= 30 }, observedAt: daysAgo(d) });
    expect(buildSkillProfile([a(20, 30), a(40, 2)], reg, { now: NOW })[0].trajectory).toEqual({ latest: 80, previous: 40, change: "improved" });
    expect(buildSkillProfile([a(40, 2), ev("SQL", "ait_practice")], reg, { now: NOW })[0].trajectory.change).toBe("not_comparable");
  });
  it("honours the student's exclusions", () => {
    const items = [ev("SQL", "ait_practice", { provenance: "ai_tathastu" }), ev("Excel", "declared")];
    expect(buildSkillProfile(items, reg, { now: NOW, excluded: ["ait_all"] }).map((e) => e.conceptId)).toEqual(["excel"]);
  });
  it("collects evidence without upgrading unverified sources, and ignores a 'verified' flag on mere questions", () => {
    const x: EvidenceInputs = {
      skills: [{ id: "s1", name: "Python", source: "avsar", createdAt: daysAgo(10) }],
      projects: [{ id: "p1", title: "Expense tracker", skills: ["React"], source: "avsar", createdAt: daysAgo(3) }],
      experienceLinks: [], certifications: [{ id: "c1", name: "AWS Certified Cloud Practitioner", source: "avsar", issuedOn: "2025-06-01" }],
      aitSkills: [{ name: "SQL", verified: true, evidenceStrength: 0.7 }, { name: "Java", verified: false, evidenceStrength: null }], aitSyncedAt: daysAgo(1),
      learning: [{ id: "l1", kind: "asked", skillName: "Docker", title: null, score: null, maxScore: null, verified: true, occurredAt: daysAgo(2), includedInProfile: true },
        { id: "l2", kind: "practiced", skillName: "Kubernetes", title: "k8s lab", score: null, maxScore: null, verified: false, occurredAt: daysAgo(2), includedInProfile: false }],
    };
    const p = buildSkillProfile(collectEvidence(x, reg), reg, { now: NOW });
    const st = Object.fromEntries(p.map((e) => [e.conceptId, e.state]));
    expect(st.python).toBe("declared");
    expect(st.react).toBe("demonstrated");
    expect(st.aws).toBe("declared"); // a certificate is not verified by Avsar
    expect(st.sql).toBe("verified");
    expect(st.java).toBeUndefined(); // unverified AIT skill arrives through the imported skill list, not as verification
    expect(st.docker).toBe("learning");
    expect(st.kubernetes).toBeUndefined(); // student excluded that event
  });
});

describe("career matching", () => {
  const profile = buildSkillProfile([ev("SQL", "project"), ev("Excel", "declared"), ev("Tableau", "ait_practice")], reg, { now: NOW });

  it("explains which skills support the match, with provenance", () => {
    const m = careerMatch(reg, facts(), profile, opp([{ name: "SQL", required: true }, { name: "Power BI", required: true }, { name: "Excel", required: false }]), { now: NOW });
    expect(m.version).toBe(SCORING.version);
    expect(m.skills.find((s) => s.requirement === "SQL")!.supportedBy).toMatchObject({ name: "SQL", state: "demonstrated", relation: "exact" });
    const pbi = m.skills.find((s) => s.requirement === "Power BI")!;
    expect(pbi.supportedBy?.relation).toBe("related"); // Tableau ↔ Power BI, labelled, partial
    expect(pbi.credit).toBeLessThan(0.5);
    expect(m.explanations.some((e) => e.kind === "inferred" && e.text.includes("related"))).toBe(true);
  });
  it("never recommends a listing whose stated requirement fails; unknown eligibility is not a failure", () => {
    const fail = careerMatch(reg, facts(), profile, opp([{ name: "SQL", required: true }], { eligibility: { educationLevels: ["masters"], graduationYearMin: null, graduationYearMax: null, minExperienceYears: null, requiredCertifications: null, allowedLocations: null, requiresWorkAuthorizationIndia: false } }), { now: NOW });
    expect(fail.excluded).toBe(true);
    const unknown = careerMatch(reg, facts({ education: [] }), profile, opp([{ name: "SQL", required: true }], { eligibility: { educationLevels: ["masters"], graduationYearMin: null, graduationYearMax: null, minExperienceYears: null, requiredCertifications: null, allowedLocations: null, requiresWorkAuthorizationIndia: false } }), { now: NOW });
    expect(unknown.excluded).toBe(false);
    expect(unknown.explanations.some((e) => e.kind === "unknown")).toBe(true);
    const ranked = rankCareerMatches([{ id: "a", deadline: null, match: fail }, { id: "b", deadline: null, match: unknown }]);
    expect(ranked.map((r) => r.id)).toEqual(["b"]);
  });
  it("a new student with no skills is not scored low on skills; skill fit is simply not assessed", () => {
    const m = careerMatch(reg, facts(), [], opp([{ name: "SQL", required: true }]), { now: NOW });
    expect(m.features.skillFit).toBeNull();
    expect(m.score).toBeNull();
    expect(m.explanations.find((e) => e.kind === "unknown")!.text).toContain("says nothing about your ability");
  });
  it("marks a missing skill as a realistic next step only when something it builds on is evidenced", () => {
    const p = buildSkillProfile([ev("JavaScript", "project")], reg, { now: NOW });
    const m = careerMatch(reg, facts(), p, opp([{ name: "React", required: true }, { name: "Kubernetes", required: true }]), { now: NOW });
    expect(m.skills.find((s) => s.requirement === "React")).toMatchObject({ development: "next_step", via: "JavaScript" });
    expect(m.skills.find((s) => s.requirement === "Kubernetes")!.development).toBe("gap");
  });
  it("text-mentioned skills never count as required", () => {
    const m = careerMatch(reg, facts(), profile, opp([{ name: "Python", required: false, origin: "text_mentioned" }]), { now: NOW });
    expect(m.skills[0].importance).toBe("mentioned");
  });
  it("fairness: institution, name and city of study don't change the score (they are not inputs)", () => {
    // CandidateFacts has no institution field at all; two students differing only in where they studied map to identical facts.
    const a = careerMatch(reg, facts({ education: [{ level: "bachelors", graduationYear: 2026, field: "CS" }] }), profile, opp([{ name: "SQL", required: true }]), { now: NOW });
    const b = careerMatch(reg, facts({ education: [{ level: "bachelors", graduationYear: 2026, field: "CS" }] }), profile, opp([{ name: "SQL", required: true }]), { now: NOW });
    expect(a.score).toBe(b.score);
    expect(Object.keys(facts())).not.toEqual(expect.arrayContaining(["institution", "gender", "caste", "religion", "disability"]));
  });
  it("a verified project without a certificate scores at least as well as a certificate without a project", () => {
    const proj = buildSkillProfile([ev("Python", "ait_project", { verification: "verified", provenance: "ai_tathastu" })], reg, { now: NOW });
    const cert = buildSkillProfile([ev("Python", "certification")], reg, { now: NOW });
    const o = opp([{ name: "Python", required: true }]);
    expect(careerMatch(reg, facts(), proj, o, { now: NOW }).score!).toBeGreaterThan(careerMatch(reg, facts(), cert, o, { now: NOW }).score!);
  });
  it("role readiness lists evidence per skill and no single percentage", () => {
    const r = roleReadiness(reg, "data_analyst", profile)!;
    expect(r.role.title).toBe("Data analyst");
    expect(r.missingEssential).toEqual(["Data analysis"]);
    expect(r).not.toHaveProperty("percent");
  });
});
