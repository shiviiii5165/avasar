import { describe, expect, it } from "vitest";

import { EVAL_NOW, LISTINGS, STUDENTS } from "./dataset";
import { evaluate, ndcgAtK, precisionAtK, rankIntelligent } from "./evaluate";

describe("metric definitions", () => {
  it("compute textbook values", () => {
    expect(precisionAtK(["a", "b", "c"], { a: 2, c: 1 })).toBeCloseTo(2 / 3);
    expect(ndcgAtK(["a", "b"], { a: 2, b: 1 })).toBe(1);
    expect(ndcgAtK(["b", "a"], { a: 2, b: 1 })!).toBeLessThan(1);
  });
});

describe("offline evaluation (synthetic)", () => {
  const r = evaluate();
  it("prints the report", () => {
    console.log(JSON.stringify(r, null, 2));
    expect(r.students).toBe(STUDENTS.length);
  });
  it("is at least as good as the lexical baseline on NDCG and precision", () => {
    expect(r.intelligent["ndcg@3"]!).toBeGreaterThanOrEqual(r.baseline["ndcg@3"]!);
    expect(r.intelligent["precision@3"]!).toBeGreaterThanOrEqual(r.baseline["precision@3"]!);
  });
  it("never recommends closed or ineligible listings (the baseline does)", () => {
    expect(r.intelligent.closedListingsRecommended).toBe(0);
    expect(r.intelligent.ineligibleRecommended).toBe(0);
    expect(r.baseline.closedListingsRecommended).toBeGreaterThan(0);
  });
  it("explanations only cite real evidence and real requirements", () => expect(r.explanationFidelity).toBe(1));
  it("institution twins rank identically", () => expect(r.fairness.institutionTwinsRankIdentically).toBe(true));
  it("eligibility unknown is not excluded; eligibility failed is", () => {
    expect(rankIntelligent(STUDENTS.find((s) => s.id === "S07")!)).toContain("L06");
    expect(rankIntelligent(STUDENTS.find((s) => s.id === "S06")!)).not.toContain("L06");
  });
  it("a new student with nothing on the profile still sees open listings (unscored), not nothing", () => {
    // Every open listing except L06, whose stated master's requirement this bachelor's student fails.
    const open = LISTINGS.filter((l) => (!l.facts.deadline || l.facts.deadline > EVAL_NOW) && l.id !== "L06").length;
    expect(rankIntelligent(STUDENTS.find((s) => s.id === "S08")!).length).toBe(open);
  });
  it("detects duplicates and flags malicious descriptions", () => {
    expect(r.deduplication).toMatchObject({ precision: 1, recall: 1 });
    expect(r.ingestion.maliciousFlagged).toBe(1);
    expect(r.ingestion.injectionDetectorOnClean).toBe(0);
  });
  it("skill extraction is precise", () => {
    expect(r.skillExtraction.precision!).toBeGreaterThanOrEqual(0.9);
  });
});
