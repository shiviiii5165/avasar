import { describe, expect, it } from "vitest";

import { distinctListings, type Comparable } from "@/server/ingestion/dedupe";
import { careerMatch, rankCareerMatches, roleReadiness } from "@/server/intelligence/career-match";
import { buildSkillProfile, STATUS, statusLabel, type EvidenceItem } from "@/server/intelligence/evidence";
import { curatedRegistry } from "@/server/intelligence/registry";
import type { CandidateFacts } from "@/server/domain/types";

import { layoutSkillNetwork, outOfBounds, overlaps } from "./skill-network-layout";
import { skillLinks, skillViews } from "./skill-view";

const reg = curatedRegistry();
const NOW = new Date("2026-11-26T00:00:00Z");
const ev = (skillName: string, type: EvidenceItem["type"], extra: Partial<EvidenceItem> = {}): EvidenceItem => ({ skillName, type, ref: null, label: skillName, observedAt: new Date("2026-10-01T00:00:00Z"), verification: "unverified", provenance: "avsar", ...extra });
const facts: CandidateFacts = {
  education: [{ level: "bachelors", graduationYear: 2026, field: "General" }],
  experiences: [], skills: [], certifications: [], city: "Pune", country: "India", workAuthorizedIndia: true,
  preferredLocations: [], workModes: [], preferredRoles: [], preferredCategories: [], expectedCompMin: null, compPeriod: null, availableFrom: null,
};

/** Every label a student can see for a skill's status. Nothing else (no "demonstrated", "declared", "inferred"). */
const VOCABULARY = new Set([...Object.values(STATUS).map((s) => s.label), "Shown in project", "Used in a job", "Passed an assessment"]);

// Synthetic students, one per career goal. The role's own essential skills are used, so nothing depends on guesses.
const GOALS: { goal: string; expected: string; offField: string }[] = [
  { goal: "Machine learning engineer", expected: "Machine learning engineer", offField: "HR intern" },
  { goal: "Business analyst", expected: "Business analyst", offField: "Mechanical design intern" },
  { goal: "Digital marketing executive", expected: "Digital marketing executive", offField: "Machine learning intern" },
  { goal: "Financial analyst", expected: "Financial analyst", offField: "UI/UX design intern" },
  { goal: "UI/UX designer", expected: "UI/UX designer", offField: "Financial analyst intern" },
  { goal: "HR executive", expected: "HR / talent acquisition associate", offField: "Machine learning intern" },
  { goal: "Mechanical engineer trainee", expected: "Mechanical engineer trainee", offField: "Digital marketing intern" },
  { goal: "Research assistant", expected: "Research assistant", offField: "HR intern" },
];

describe("career page view model, for eight synthetic students", () => {
  for (const g of GOALS) {
    describe(g.goal, () => {
      const role = reg.roleFor(g.goal)!;
      const [a, b, c] = role.essential.map((id) => reg.displayName(id, id));
      const items = [
        ev(a, "project", { ref: "p1", label: "Capstone project" }),
        ...(b ? [ev(b, "project", { ref: "p1", label: "Capstone project" })] : []),
        ...(c ? [ev(c, "declared")] : []),
        ev("Communication", "declared"),
      ];
      const profile = buildSkillProfile(items, reg, { now: NOW });
      const readiness = roleReadiness(reg, role.id, profile)!;
      const views = skillViews(profile, { title: readiness.role.title, skills: readiness.skills });

      it("shows the student's own career goal", () => {
        expect(readiness.role.title).toBe(g.expected);
      });
      it("uses only the plain-language status words, and counts only recorded evidence", () => {
        for (const v of views) {
          expect(VOCABULARY.has(v.label)).toBe(true);
          expect(v.label).not.toMatch(/demonstrated|declared|inferred|evidenced/i);
          expect(v.evidenceCount).toBe(profile.find((p) => p.key === v.key)!.evidence.length);
        }
        expect(views.find((v) => v.name === a)!.label).toBe("Shown in project");
        if (c) expect(views.find((v) => v.name === c)!.label).toBe("Added to profile");
        expect(views.find((v) => v.name === a)!.goal).toBe(`Essential for ${g.expected}`);
      });
      it("links only skills that share a project", () => {
        const links = skillLinks(profile);
        if (b) expect(links).toEqual([{ source: [a, b].map((n) => reg.key(n)).sort()[0], target: [a, b].map((n) => reg.key(n)).sort()[1], via: "Capstone project" }]);
        else expect(links).toEqual([]);
      });
      it("keeps recommendations domain-aware: an in-field listing ranks above an off-field one", () => {
        const listing = (title: string) => ({ title, category: "internship" as const, workMode: "remote" as const, locations: [], country: "India", compMin: null, compMax: null, compPeriod: null, unpaid: false, deadline: null, startDate: null, experienceMinYears: null, eligibility: null, skills: [{ name: "Communication", required: true }] });
        const ranked = rankCareerMatches(
          [
            { id: "off", deadline: null, match: careerMatch(reg, facts, profile, listing(g.offField), { targetRoles: [g.goal], now: NOW }) },
            { id: "in", deadline: null, match: careerMatch(reg, facts, profile, listing(role.title), { targetRoles: [g.goal], now: NOW }) },
          ],
          2,
        );
        expect(ranked[0].id).toBe("in");
      });
    });
  }
});

describe("status words", () => {
  it("never calls a job or an assessment a project", () => {
    expect(statusLabel(buildSkillProfile([ev("SQL", "work_experience", { label: "Analyst at Acme" })], reg, { now: NOW })[0])).toBe("Used in a job");
    expect(statusLabel(buildSkillProfile([ev("SQL", "assessment", { result: { score: 8, maxScore: 10, passed: true } })], reg, { now: NOW })[0])).toBe("Passed an assessment");
    expect(statusLabel(buildSkillProfile([ev("SQL", "ait_verified_skill", { verification: "verified" })], reg, { now: NOW })[0])).toBe("Verified");
    expect(statusLabel(buildSkillProfile([ev("SQL", "ait_practice")], reg, { now: NOW })[0])).toBe("Practising");
  });
});

describe("duplicate listings on the career page", () => {
  const base: Comparable = { sourceId: "s1", sourceRecordId: "r1", urls: ["https://acme.example.com/jobs/42"], fingerprint: "f1", title: "Data Analyst Intern", organization: "Acme Pvt Ltd", locations: ["Pune"], workMode: "onsite", description: "Analyse sales data with SQL and Excel and present weekly dashboards to the team.", deadline: new Date("2026-12-31") };
  const ids = (list: (Comparable & { id: string })[]) => distinctListings(list, (x) => x).map((x) => x.id);

  it("shows the same listing from two feeds once, at its best-ranked position", () => {
    expect(ids([{ ...base, id: "a" }, { ...base, id: "b", sourceId: "s2", sourceRecordId: "x", fingerprint: "f2", urls: ["https://acme.example.com/jobs/42?utm_source=feed"], title: "Data analyst intern" }])).toEqual(["a"]);
    expect(ids([{ ...base, id: "a" }, { ...base, id: "b", sourceId: "s2", sourceRecordId: "x", fingerprint: "f2", urls: [], organization: "ACME Private Limited", title: "Data Analyst - Intern" }])).toEqual(["a"]);
  });
  it("keeps distinct roles from the same organization, even with one shared careers-page link", () => {
    const careers = ["https://acme.example.com/careers"];
    expect(ids([{ ...base, id: "a", urls: careers }, { ...base, id: "b", sourceRecordId: "r2", fingerprint: "f2", urls: careers, title: "Marketing Intern", description: "Plan social campaigns and write posts." }])).toEqual(["a", "b"]);
    expect(ids([{ ...base, id: "a" }, { ...base, id: "b", sourceRecordId: "r2", fingerprint: "f2", urls: [], locations: ["Chennai"] }])).toEqual(["a", "b"]);
  });
  it("respects the limit after removing duplicates", () => {
    const list = Array.from({ length: 12 }, (_, i) => ({ ...base, id: `x${i}`, sourceRecordId: `r${i}`, fingerprint: `f${i}`, urls: [], title: `Role ${i}`, description: `Different work number ${i} with its own duties.` }));
    const withDup = [list[0], { ...list[0], id: "dup" }, ...list.slice(1)];
    expect(distinctListings(withDup, (x) => x, 8).map((x) => x.id)).toEqual(list.slice(0, 8).map((x) => x.id));
  });
});

describe("skill bubble layout", () => {
  const nodes = Array.from({ length: 24 }, (_, i) => ({ id: `s${i}`, name: ["Python", "Machine Learning", "Natural Language Processing", "SQL", "Communication", "Statistics"][i % 6] + (i >= 6 ? ` ${i}` : ""), evidenceCount: (i % 7) + 1 }));
  for (const width of [320, 768, 1100]) {
    it(`never overlaps or clips bubbles at ${width}px`, () => {
      const l = layoutSkillNetwork(nodes, [{ source: "s0", target: "s1" }], width);
      expect(overlaps(l)).toEqual([]);
      expect(outOfBounds(l)).toEqual([]);
    });
  }
  it("is deterministic and sizes bubbles only by evidence count", () => {
    const a = layoutSkillNetwork(nodes.slice(0, 6), [], 800);
    const b = layoutSkillNetwork(nodes.slice(0, 6), [], 800);
    expect([...a.nodes.values()]).toEqual([...b.nodes.values()]);
    const one = layoutSkillNetwork([{ id: "a", name: "SQL", evidenceCount: 1 }, { id: "b", name: "SQL", evidenceCount: 6 }], [], 800);
    expect(one.nodes.get("b")!.r).toBeGreaterThan(one.nodes.get("a")!.r);
  });
  it("a long name never makes a skill look better evidenced", () => {
    const l = layoutSkillNetwork([{ id: "nlp", name: "Natural language processing", evidenceCount: 1 }, { id: "py", name: "Python", evidenceCount: 2 }, { id: "sql", name: "SQL", evidenceCount: 1 }], [], 800);
    expect(l.nodes.get("py")!.r).toBeGreaterThan(l.nodes.get("nlp")!.r);
    expect(l.nodes.get("nlp")!.r).toBe(l.nodes.get("sql")!.r);
    expect(l.nodes.get("nlp")!.lines).toEqual(["Natural", "language", "processing"]);
  });
});
