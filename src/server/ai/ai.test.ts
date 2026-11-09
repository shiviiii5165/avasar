import { beforeAll, describe, expect, it } from "vitest";

import { createMemoryDb, type Db } from "../db/client";
import { upsertIdentity } from "../auth/identity";
import { classifyOpportunity, duplicateSkills, extractRequirements, roadmap, suggestRoles } from "../domain/career";
import { uploadResume } from "../services/documents";
import { ensureProfile, loadProfile } from "../services/profiles";
import { applyResumeSuggestions, suggestFromResume } from "../services/resume-intel";
import { ground, redactContact } from "./grounding";
import { extractResumeSafely } from "./index";
import { extractWithRules } from "./rules";
import { EMPTY_EXTRACTION, type AiProvider } from "./types";

const RESUME = `Priya Sharma
priya.sharma@example.com | +91 98765 43210 | https://github.com/priya
Summary
Final-year student who enjoys building data tools.
Education
Pune Institute of Computer Technology, B.E. Computer Engineering, 2022 - 2026
Skills
Python, SQL, Power BI, Excel, Git
Experience
Data Analyst Intern at Kaveri FinServe (Jun 2025 - Aug 2025)
Projects
Loan Default Dashboard: Power BI dashboard on public lending data
Certifications
Google Data Analytics by Coursera 2024`;

describe("rules extractor (controlled fixture)", () => {
  const x = extractWithRules(RESUME);
  it("extracts exactly what the resume states", () => {
    expect(x.skills.map((s) => s.name).sort()).toEqual(["Excel", "Git", "Power BI", "Python", "SQL"]);
    expect(x.education[0]).toMatchObject({ institution: "Pune Institute of Computer Technology", graduationYear: 2026 });
    expect(x.experience[0]).toMatchObject({ title: "Data Analyst Intern", organization: "Kaveri FinServe", startDate: "Jun 2025", endDate: "Aug 2025" });
    expect(x.projects[0].title).toBe("Loan Default Dashboard");
    expect(x.certifications[0]).toMatchObject({ name: "Google Data Analytics", issuer: "Coursera" });
  });
  it("invents nothing: no skills that aren't in the text", () => {
    expect(x.skills.some((s) => /react|java\b|machine learning/i.test(s.name))).toBe(false);
    expect(extractWithRules("Hobbies\nCricket and reading novels.").skills).toEqual([]);
  });
});

describe("grounding", () => {
  it("drops fabricated items whose evidence isn't in the resume", () => {
    const { kept, rejected } = ground({
      ...EMPTY_EXTRACTION,
      skills: [{ name: "SQL", evidence: "Python, SQL, Power BI, Excel, Git" }, { name: "Kubernetes", evidence: "Expert in Kubernetes" }],
      experience: [{ title: "Senior Engineer", organization: "Google", evidence: "Senior Engineer at Google" }],
      education: [{ institution: "Pune Institute of Computer Technology", graduationYear: 2019, evidence: "Pune Institute of Computer Technology, B.E. Computer Engineering, 2022 - 2026" }],
    }, RESUME);
    expect(kept.skills.map((s) => s.name)).toEqual(["SQL"]);
    expect(kept.experience).toEqual([]);
    expect(kept.education).toEqual([]); // wrong year is rejected, not "corrected"
    expect(rejected).toBe(3);
  });
  it("rejects an item whose value isn't in its own evidence", () => {
    expect(ground({ ...EMPTY_EXTRACTION, skills: [{ name: "Rust", evidence: "Python, SQL, Power BI, Excel, Git" }] }, RESUME).kept.skills).toEqual([]);
  });
  it("redacts contact details before text is sent to a provider", () => {
    const r = redactContact(RESUME);
    expect(r).not.toMatch(/example\.com|98765|github\.com/);
  });
});

describe("provider failure never blocks", () => {
  it("falls back to the rules engine when the AI provider throws", async () => {
    const broken: AiProvider = { name: "anthropic", extractResume: async () => { throw new Error("503"); } };
    const r = await extractResumeSafely(RESUME, broken);
    expect(r.fellBack).toBe(true);
    expect(r.provider).toBe("rules");
    expect(r.result.skills.length).toBeGreaterThan(0);
  });
  it("grounds a provider's output too (a hallucinating model is filtered)", async () => {
    const liar: AiProvider = { name: "anthropic", extractResume: async () => ({ ...EMPTY_EXTRACTION, skills: [{ name: "Python", evidence: "Python, SQL, Power BI, Excel, Git" }, { name: "Go", evidence: "Built services in Go" }] }) };
    const r = await extractResumeSafely(RESUME, liar);
    expect(r.result.skills.map((s) => s.name)).toEqual(["Python"]);
    expect(r.rejected).toBe(1);
  });
});

describe("career intelligence", () => {
  it("detects duplicate spellings of a skill", () => {
    expect(duplicateSkills(["React", "ReactJS", "SQL", "react.js"])).toEqual([["React", "ReactJS", "react.js"]]);
  });
  it("suggests roles only with real overlap, and an ordered roadmap", () => {
    const roles = suggestRoles(["SQL", "Excel", "Python"]);
    expect(roles[0].role).toBe("Data Analyst");
    expect(suggestRoles(["Cooking"])).toEqual([]);
    const plan = roadmap(roles[0], new Map([["Power BI", 3], ["Tableau", 1]]), ["SQL", "Excel", "Python"]);
    expect(plan[0].skill).toBe("Power BI");
    expect(plan[0].why).toMatch(/core to Data Analyst/);
    expect(plan.every((s) => s.project.length > 10)).toBe(true);
  });
  it("classifies listings and extracts requirements from text, returning null when unclear", () => {
    expect(classifyOpportunity("6-month internship with a monthly stipend")).toBe("internship");
    expect(classifyOpportunity("We need help")).toBeNull();
    expect(extractRequirements("Must know React and TypeScript; Figma is a plus.")).toEqual(["TypeScript", "React", "Figma"]);
  });
});

/** Minimal valid text PDF containing the fixture (so real parsing runs end to end). */
function pdfOf(text: string): Buffer {
  const lines = text.split("\n").map((l, i) => `BT /F1 10 Tf 40 ${800 - i * 14} Td (${l.replace(/[()\\]/g, "\\$&")}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(lines)} >>\nstream\n${lines}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

describe("resume suggestions service (real PDF parsing, confirmation required)", () => {
  let db: Db, identityId: string, profileId: string, resumeId: string;
  beforeAll(async () => {
    db = await createMemoryDb();
    identityId = (await upsertIdentity(db, { provider: "ai_tathastu", subject: "ai-1", email: null, emailVerified: false, name: "Priya" })).id;
    profileId = (await ensureProfile(db, identityId, "Priya"))!.id;
    resumeId = (await uploadResume(db, { identityId, profileId }, { name: "cv.pdf", bytes: pdfOf(RESUME) }, "CV")).id;
  });

  it("suggests without writing anything", async () => {
    const { suggestions, provider } = await suggestFromResume(db, identityId, profileId, resumeId);
    expect(provider).toBe("rules");
    expect(suggestions.skills.map((s) => s.name)).toContain("Power BI");
    const p = (await loadProfile(db, profileId))!;
    expect(p.skills).toHaveLength(0);
    expect(p.education).toHaveLength(0);
  });

  it("applies only confirmed items, re-checked against the resume (tampering is ignored)", async () => {
    const { suggestions } = await suggestFromResume(db, identityId, profileId, resumeId);
    const chosen = { ...EMPTY_EXTRACTION, skills: [...suggestions.skills.filter((s) => s.name === "SQL"), { name: "Kubernetes", evidence: "Kubernetes" }], education: suggestions.education };
    const counts = await applyResumeSuggestions(db, identityId, profileId, resumeId, chosen);
    expect(counts).toMatchObject({ skills: 1, education: 1 });
    const p = (await loadProfile(db, profileId))!;
    expect(p.skills.map((s) => s.name)).toEqual(["SQL"]);
    expect(p.skills[0].source).toBe("avsar");
    expect(p.education[0].level).toBe("bachelors");
    // Already-added items are not suggested again.
    const again = await suggestFromResume(db, identityId, profileId, resumeId);
    expect(again.suggestions.skills.some((s) => s.name === "SQL")).toBe(false);
    expect(again.suggestions.education).toEqual([]);
  });

  it("other people's resumes are not readable", async () => {
    const other = (await upsertIdentity(db, { provider: "ai_tathastu", subject: "ai-2", email: null, emailVerified: false, name: "X" })).id;
    const otherProfile = (await ensureProfile(db, other, "X"))!.id;
    await expect(suggestFromResume(db, other, otherProfile, resumeId)).rejects.toThrow("Resume not found");
  });
});
