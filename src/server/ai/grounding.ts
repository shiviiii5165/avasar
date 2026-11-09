import { normalizeSkill } from "../domain/skills";
import type { ResumeExtraction } from "./types";

/** Lowercase, collapse whitespace and unify dashes/quotes so "evidence" can be compared with the source. */
export const squash = (s: string) => s.toLowerCase().replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

/**
 * Keeps only items that are supported by the resume: the evidence must appear in the text, and the item's
 * main value (skill, institution, role, project, certificate) must appear inside its own evidence.
 * Returns what was kept and how many items were rejected (shown as uncertainty, never silently).
 */
export function ground(x: ResumeExtraction, text: string): { kept: ResumeExtraction; rejected: number } {
  const src = squash(text);
  let rejected = 0;
  const ok = (ev: string, ...values: (string | null | undefined)[]) => {
    const e = squash(ev);
    const pass = e.length >= 2 && src.includes(e) && values.every((v) => !v || e.includes(squash(v)) || src.includes(squash(v)));
    if (!pass) rejected++;
    return pass;
  };
  const seenSkill = new Set<string>();
  const kept: ResumeExtraction = {
    skills: x.skills.filter((s) => {
      const key = normalizeSkill(s.name);
      if (seenSkill.has(key)) return false; // duplicate, not a rejection
      if (!ok(s.evidence, s.name)) return false;
      seenSkill.add(key);
      return true;
    }),
    education: x.education.filter((e) => {
      if (!ok(e.evidence, e.institution)) return false;
      // A year must be stated in the item's own evidence; a wrong year is rejected, never "corrected".
      if (e.graduationYear != null && !squash(e.evidence).includes(String(e.graduationYear))) { rejected++; return false; }
      return true;
    }),
    experience: x.experience.filter((e) => ok(e.evidence, e.title, e.organization)),
    projects: x.projects.filter((p) => ok(p.evidence, p.title)),
    certifications: x.certifications.filter((c) => ok(c.evidence, c.name)),
  };
  return { kept, rejected };
}

/** Removes emails, phone numbers and URLs before text leaves Avsar (data minimization for AI providers). */
export function redactContact(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(\+?\d[\d\s-]{8,}\d)/g, "[phone]")
    .replace(/https?:\/\/\S+/gi, "[link]");
}
