import { describe, expect, it } from "vitest";

import type { CandidateFacts, OpportunityFacts } from "../domain/types";
import { bestSupport, bestSupportScan, careerMatch, type ListingSkill } from "./career-match";
import { classifyOpportunity } from "./domains";
import { buildSkillProfile, type EvidenceItem } from "./evidence";
import { curatedRegistry } from "./registry";
import { CONCEPTS, ROLES } from "./registry-data";

/**
 * Performance budget for the per-request matching work (scale: thousands of open listings, a large student profile).
 * Every student page matches the student against every open listing, so this must stay fast as the catalogue grows.
 * Budgets are generous (CI machines vary) and catch order-of-magnitude regressions, not micro-changes.
 */
const reg = curatedRegistry();
const NOW = new Date("2026-11-26T00:00:00Z");
const facts: CandidateFacts = {
  education: [{ level: "bachelors", graduationYear: 2026, field: "Computer Science" }],
  experiences: [], skills: [], certifications: [], city: "Pune", country: "India", workAuthorizedIndia: true,
  preferredLocations: ["Pune"], workModes: ["remote"], preferredRoles: [], preferredCategories: [], expectedCompMin: null, compPeriod: null, availableFrom: null,
};
// Deterministic pseudo-random generator (no Math.random: results must be repeatable).
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}
const rand = rng(42);
const conceptNames = CONCEPTS.map((c) => c.name);
const roleTitles = ROLES.map((r) => r.title);
const LISTINGS = 3000;
const listings: (OpportunityFacts & { skills: ListingSkill[] })[] = Array.from({ length: LISTINGS }, (_, i) => ({
  title: rand() < 0.7 ? `${roleTitles[Math.floor(rand() * roleTitles.length)]} Intern` : `Opening ${i}`,
  category: "internship", workMode: rand() < 0.5 ? "remote" : "onsite", locations: ["Pune"], country: "India",
  compMin: null, compMax: null, compPeriod: null, unpaid: false, deadline: null, startDate: null, experienceMinYears: null, eligibility: null,
  skills: Array.from({ length: 6 }, () => ({ name: conceptNames[Math.floor(rand() * conceptNames.length)], required: rand() < 0.5, origin: rand() < 0.2 ? "text_mentioned" as const : "listed" as const })),
}));
const ev = (skillName: string, type: EvidenceItem["type"]): EvidenceItem => ({ skillName, type, ref: type === "project" ? "p1" : null, label: skillName, observedAt: NOW, verification: "unverified", provenance: "avsar" });
const profile = buildSkillProfile(conceptNames.slice(0, 60).map((n, i) => ev(n, i % 3 ? "declared" : "project")), reg, { now: NOW });

function time(fn: () => void, runs = 3) {
  fn(); // warm-up
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return Math.min(...t);
}

describe("indexed skill lookup gives exactly the old answers", () => {
  it("matches the linear scan for random profiles and every requirement (ties included)", () => {
    const r = rng(7);
    const states: EvidenceItem["type"][] = ["declared", "project", "ait_practice", "ait_learning", "work_experience"];
    const wants = [...CONCEPTS.map((c) => c.id), ...["text:underwater basket weaving", "text:communication", "text:plasmo"]];
    for (let trial = 0; trial < 40; trial++) {
      const names = Array.from({ length: 5 + Math.floor(r() * 50) }, () => (r() < 0.1 ? ["Underwater basket weaving", "plasmo", "communication"][Math.floor(r() * 3)] : conceptNames[Math.floor(r() * conceptNames.length)]));
      const p = buildSkillProfile(names.map((n) => ev(n, states[Math.floor(r() * states.length)])), reg, { now: NOW });
      for (const w of wants) {
        const a = bestSupport(reg, p, w);
        const b = bestSupportScan(reg, p, w);
        expect(a && { key: a.e.key, rel: a.rel, credit: a.credit }, `want ${w}`).toEqual(b && { key: b.e.key, rel: b.rel, credit: b.credit });
      }
    }
  });
});

describe("matching performance budget", () => {
  it(`matches one student (${profile.length} skills) against ${LISTINGS} listings quickly`, () => {
    const ms = time(() => {
      for (const o of listings) careerMatch(reg, facts, profile, o, { targetRoles: ["Machine learning engineer", "Data analyst"], now: NOW });
    });
    console.log(`[perf] careerMatch x${LISTINGS}: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(1500);
  });
  it(`classifies ${LISTINGS} listings quickly`, () => {
    const ms = time(() => {
      for (const o of listings) classifyOpportunity(reg, o);
    });
    console.log(`[perf] classify x${LISTINGS}: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(800);
  });
});
