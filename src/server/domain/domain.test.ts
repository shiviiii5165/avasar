import { describe, expect, it } from "vitest";

import { profileCompleteness } from "./completeness";
import { evaluateEligibility, experienceYears } from "./eligibility";
import { DEFAULT_WEIGHTS, matchOpportunity } from "./matching";
import { can } from "./permissions";
import { normalizeSkill, parseSkillList } from "./skills";
import type { CandidateFacts, OpportunityFacts } from "./types";
import { canTransitionApplication, canTransitionOpportunity, isPubliclyVisible, isSafeHttpsUrl, publishProblems } from "./workflows";

const NOW = new Date("2026-11-06T00:00:00Z");

const candidate = (over: Partial<CandidateFacts> = {}): CandidateFacts => ({
  education: [{ level: "bachelors", graduationYear: 2026, field: "Computer Science" }],
  experiences: [{ kind: "internship", startDate: "2025-06-01", endDate: "2025-12-01", current: false }],
  skills: [
    { name: "React.js", level: "intermediate", evidenceCount: 1 },
    { name: "TypeScript", level: "intermediate", evidenceCount: 1 },
    { name: "SQL", level: "beginner", evidenceCount: 0 },
  ],
  certifications: [],
  city: "Pune",
  country: "India",
  workAuthorizedIndia: true,
  preferredLocations: ["Bengaluru"],
  workModes: ["hybrid", "remote"],
  preferredRoles: ["frontend"],
  preferredCategories: ["internship"],
  expectedCompMin: 15000,
  compPeriod: "month",
  availableFrom: null,
  ...over,
});

const opp = (over: Partial<OpportunityFacts> = {}): OpportunityFacts => ({
  title: "Frontend Developer Intern",
  category: "internship",
  workMode: "hybrid",
  locations: ["Pune"],
  country: "India",
  compMin: 15000,
  compMax: 25000,
  compPeriod: "month",
  unpaid: false,
  deadline: new Date("2026-12-01T00:00:00Z"),
  startDate: null,
  experienceMinYears: null,
  skills: [
    { name: "React", required: true },
    { name: "TypeScript", required: true },
    { name: "Figma", required: false },
  ],
  eligibility: { educationLevels: ["bachelors"], graduationYearMin: 2025, graduationYearMax: 2027, minExperienceYears: null, requiredCertifications: null, allowedLocations: null, requiresWorkAuthorizationIndia: true },
  ...over,
});

describe("skills", () => {
  it("normalizes aliases", () => {
    expect(normalizeSkill("React.js")).toBe("react");
    expect(normalizeSkill(" ReactJS ")).toBe("react");
    expect(normalizeSkill("Node.js")).toBe("nodejs");
  });
  it("parses lists without duplicates", () => {
    expect(parseSkillList("React, react.js, SQL\nPython,, ")).toEqual(["React", "SQL", "Python"]);
  });
});

describe("eligibility", () => {
  it("passes when all hard requirements are met", () => {
    const r = evaluateEligibility(candidate(), opp(), NOW);
    expect(r.status).toBe("eligible");
  });
  it("fails a hard requirement regardless of anything else", () => {
    const r = evaluateEligibility(candidate({ education: [{ level: "bachelors", graduationYear: 2020, field: null }] }), opp(), NOW);
    expect(r.status).toBe("ineligible");
    expect(r.checks.find((c) => c.key === "graduation_year")?.outcome).toBe("fail");
  });
  it("treats missing information as unknown, never as failure", () => {
    const r = evaluateEligibility(candidate({ education: [], workAuthorizedIndia: null }), opp(), NOW);
    expect(r.status).toBe("insufficient_information");
    expect(r.missingInformation).toContain("Add your education");
  });
  it("is potentially eligible when some checks pass and others are unknown", () => {
    const r = evaluateEligibility(candidate({ workAuthorizedIndia: null }), opp(), NOW);
    expect(r.status).toBe("potentially_eligible");
  });
  it("closes after the deadline", () => {
    const r = evaluateEligibility(candidate(), opp({ deadline: new Date("2026-01-01") }), NOW);
    expect(r.status).toBe("ineligible");
  });
  it("counts internships at half weight", () => {
    expect(experienceYears([{ kind: "internship", startDate: "2024-01-01", endDate: "2025-01-01", current: false }], NOW)).toBe(0.5);
    expect(experienceYears([], NOW)).toBeNull();
  });
  it("ignores location restrictions for remote roles", () => {
    const r = evaluateEligibility(candidate({ city: "Delhi", preferredLocations: [] }), opp({ workMode: "remote", eligibility: { ...opp().eligibility!, allowedLocations: ["Pune"] } }), NOW);
    expect(r.checks.find((c) => c.key === "location")).toBeUndefined();
  });
});

describe("matching", () => {
  it("weights sum to 1", () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it("explains matching and missing skills", () => {
    const m = matchOpportunity(candidate(), opp(), DEFAULT_WEIGHTS, NOW);
    expect(m.matchingSkills).toEqual(["React", "TypeScript"]);
    expect(m.missingPreferredSkills).toEqual(["Figma"]);
    expect(m.score).toBeGreaterThan(70);
    expect(m.reasons.join(" ")).toMatch(/React/);
  });
  it("does not penalize missing data, it lowers completeness", () => {
    const sparse = candidate({ skills: [], workModes: [], preferredRoles: [], preferredCategories: [], expectedCompMin: null, preferredLocations: [], city: null });
    const m = matchOpportunity(sparse, opp(), DEFAULT_WEIGHTS, NOW);
    expect(m.completeness).toBeLessThan(0.5);
    expect(m.nextActions).toContain("Add your skills to see how you match");
  });
  it("never lets a high score hide an ineligible result", () => {
    const m = matchOpportunity(candidate({ workAuthorizedIndia: false }), opp(), DEFAULT_WEIGHTS, NOW);
    expect(m.eligibility.status).toBe("ineligible");
    expect(m.nextActions[0]).toMatch(/mandatory requirement/);
  });
  it("reports evidence strength from linked evidence", () => {
    expect(matchOpportunity(candidate(), opp(), DEFAULT_WEIGHTS, NOW).evidence).toBe("high");
    const noEvidence = candidate({ skills: [{ name: "React", level: null, evidenceCount: 0 }] });
    expect(matchOpportunity(noEvidence, opp(), DEFAULT_WEIGHTS, NOW).evidence).toBe("low");
  });
});

describe("workflows", () => {
  it("never publishes without review", () => {
    expect(canTransitionOpportunity("imported", "published")).toBe(false);
    expect(canTransitionOpportunity("draft", "published")).toBe(false);
    expect(canTransitionOpportunity("approved", "published")).toBe(true);
  });
  it("validates publishable listings", () => {
    const base = { title: "Data Analyst", description: "x".repeat(50), organizationName: "Acme", deadline: new Date("2026-12-01"), applicationMethod: "external" as const, externalUrl: "http://bad", sourceUrl: null, isImported: true };
    expect(publishProblems(base, NOW)).toEqual(["External application URL must be a valid https:// link", "Imported listings must keep their source URL"]);
  });
  it("hides unpublished and expired listings", () => {
    expect(isPubliclyVisible({ status: "approved", deadline: null }, NOW)).toBe(false);
    expect(isPubliclyVisible({ status: "published", deadline: new Date("2026-01-01") }, NOW)).toBe(false);
    expect(isPubliclyVisible({ status: "published", deadline: null }, NOW)).toBe(true);
  });
  it("only candidates withdraw; reviewers move forward; terminal states are final", () => {
    expect(canTransitionApplication("submitted", "withdrawn", "candidate")).toBe(true);
    expect(canTransitionApplication("submitted", "shortlisted", "candidate")).toBe(false);
    expect(canTransitionApplication("submitted", "interview", "admin")).toBe(true);
    expect(canTransitionApplication("interview", "submitted", "admin")).toBe(false);
    expect(canTransitionApplication("selected", "rejected", "admin")).toBe(false);
    expect(canTransitionApplication("submitted", "withdrawn", "admin")).toBe(false);
  });
  it("accepts only safe https URLs", () => {
    expect(isSafeHttpsUrl("https://jobs.example.com/apply")).toBe(true);
    expect(isSafeHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpsUrl("https://user:pw@example.com")).toBe(false);
  });
});

describe("permissions", () => {
  it("is least privilege", () => {
    expect(can(["moderator"], "report.moderate")).toBe(true);
    expect(can(["moderator"], "opportunity.publish")).toBe(false);
    expect(can(["support_agent"], "audit.view")).toBe(false);
    expect(can(["super_admin"], "role.grant")).toBe(true);
    expect(can([], "opportunity.create")).toBe(false);
  });
});

describe("dashboard deadlines", () => {
  it("lists only open, unapplied listings closing within the window, soonest first", async () => {
    const { upcomingDeadlines } = await import("./dashboard");
    const d = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
    const items = [{ id: "a", deadline: d(10) }, { id: "b", deadline: d(2) }, { id: "c", deadline: d(-1) }, { id: "d", deadline: d(30) }, { id: "e", deadline: null }, { id: "f", deadline: d(3) }];
    expect(upcomingDeadlines(items, new Set(["f"]), NOW).map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("completeness", () => {
  it("points to the next most useful section", () => {
    const r = profileCompleteness({ basics: true, education: 1, skills: 2, experienceOrProjects: 0, preferences: false, resume: false, links: false });
    expect(r.percent).toBe(35);
    expect(r.next?.label).toBe("Skills");
  });
});
