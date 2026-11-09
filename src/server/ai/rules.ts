import { KNOWN_SKILLS } from "../domain/career";
import { normalizeSkill } from "../domain/skills";
import type { AiProvider, ResumeExtraction } from "./types";

/**
 * Deterministic, offline resume extractor (the default provider). It recognises section headings and
 * known skills, degrees, date ranges and certificate lines. It only ever copies what the resume says.
 */
const HEADINGS: Record<string, keyof ResumeExtraction | "other"> = {
  skills: "skills", "technical skills": "skills", "key skills": "skills", technologies: "skills",
  education: "education", "academic background": "education", qualifications: "education",
  experience: "experience", "work experience": "experience", internships: "experience", employment: "experience", "professional experience": "experience",
  projects: "projects", "academic projects": "projects", "personal projects": "projects",
  certifications: "certifications", certificates: "certifications", "licenses & certifications": "certifications", courses: "certifications",
  summary: "other", objective: "other", achievements: "other", awards: "other", interests: "other", hobbies: "other", languages: "other", contact: "other",
};
const DEGREE = /\b(b\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|bca|b\.?\s?com|b\.?\s?a\b|bba|m\.?\s?tech|m\.?\s?sc|mca|mba|m\.?\s?a\b|m\.?\s?com|ph\.?\s?d|diploma|bachelor|master|class (x|xii|10|12)|hsc|ssc|12th|10th)\b/i;
const INSTITUTION = /\b(university|college|institute|school|iit|nit|iiit|academy|vidyalaya|polytechnic)\b/i;
const RANGE = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})\s*(?:-|–|—|to)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4}|present|current|now)/i;
const YEAR = /\b(19[5-9]\d|20[0-4]\d)\b/g;

const clean = (l: string) => l.replace(/^[\s•●▪◦\-*–·]+/, "").replace(/\s+/g, " ").trim();

function sections(text: string) {
  const out: { kind: keyof ResumeExtraction | "other" | "top"; lines: string[] }[] = [{ kind: "top", lines: [] }];
  for (const raw of text.split("\n")) {
    const line = clean(raw);
    if (!line) continue;
    const key = line.toLowerCase().replace(/[:|]+$/, "").trim();
    if (HEADINGS[key] && line.length <= 40) out.push({ kind: HEADINGS[key], lines: [] });
    else out[out.length - 1].lines.push(line);
  }
  return out;
}

const SKILL_PATTERNS = KNOWN_SKILLS.map((s) => ({ name: s, re: new RegExp(`(^|[^a-z0-9+#.])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9+#])`, "i") }));

export function extractWithRules(text: string): ResumeExtraction {
  const out: ResumeExtraction = { skills: [], education: [], experience: [], projects: [], certifications: [] };
  const secs = sections(text);
  const seen = new Set<string>();

  // Skills: known skills anywhere in the resume, with the line they appear on as evidence.
  for (const line of text.split("\n").map(clean).filter(Boolean)) {
    // Links and emails aren't statements of skill (a github.com URL doesn't mean "GitHub" was claimed).
    const stated = line.replace(/https?:\/\/\S+|\b[\w.-]+\.(com|in|io|org|dev|net)\/\S*|[\w.+-]+@[\w.-]+/gi, " ");
    for (const p of SKILL_PATTERNS) {
      const key = normalizeSkill(p.name);
      if (!seen.has(key) && p.re.test(stated)) { seen.add(key); out.skills.push({ name: p.name, evidence: line.slice(0, 400) }); }
    }
  }

  for (const s of secs) {
    if (s.kind === "education") {
      for (let i = 0; i < s.lines.length; i++) {
        const line = s.lines[i];
        if (!INSTITUTION.test(line) && !DEGREE.test(line)) continue;
        const near = [line, s.lines[i + 1] ?? ""].join(" ");
        const institution = INSTITUTION.test(line) ? line.split(/[,|–—]| - /)[0].trim() : (s.lines[i + 1] && INSTITUTION.test(s.lines[i + 1]) ? s.lines[i + 1].split(/[,|–—]| - /)[0].trim() : null);
        if (!institution || out.education.some((e) => e.institution === institution)) continue;
        const years = near.match(YEAR)?.map(Number) ?? [];
        const degree = near.match(DEGREE)?.[0] ?? null;
        out.education.push({ institution: institution.slice(0, 200), degree, field: null, graduationYear: years.length ? Math.max(...years) : null, evidence: (INSTITUTION.test(line) ? line : s.lines[i + 1]).slice(0, 400) });
      }
    }
    if (s.kind === "experience") {
      for (const line of s.lines) {
        // "Role at Organization (dates)" / "Role, Organization | dates" / "Role - Organization"
        const m = line.match(/^(.{2,80}?)\s+(?:at|@)\s+(.{2,80}?)(?:\s*[|(,]|\s+-\s+|$)/i) ?? line.match(/^(.{2,80}?)\s*[,|]\s*(.{2,80}?)(?:\s*[|(,]|$)/);
        if (!m || DEGREE.test(line)) continue;
        const range = line.match(RANGE);
        out.experience.push({ title: m[1].trim(), organization: m[2].replace(RANGE, "").trim(), startDate: range?.[1] ?? null, endDate: range?.[2] ?? null, evidence: line.slice(0, 400) });
      }
    }
    if (s.kind === "projects") {
      for (let i = 0; i < s.lines.length; i++) {
        const line = s.lines[i];
        const title = line.split(/[:|–—]| - /)[0].trim();
        if (title.length < 3 || title.length > 100 || /^(tech|technologies|tools|stack|built|developed|used)\b/i.test(title)) continue;
        const rest = line.slice(title.length).replace(/^[\s:|–—-]+/, "");
        out.projects.push({ title, description: rest || (s.lines[i + 1] && !s.lines[i + 1].includes(":") ? s.lines[i + 1].slice(0, 600) : null), evidence: line.slice(0, 400) });
        if (out.projects.length >= 10) break;
      }
    }
    if (s.kind === "certifications") {
      for (const line of s.lines) {
        const [name, issuer] = line.split(/\s+(?:by|from|-|–|\|)\s+/i);
        if (name.length >= 3) out.certifications.push({ name: name.trim().slice(0, 160), issuer: issuer?.replace(RANGE, "").replace(YEAR, "").trim() || null, evidence: line.slice(0, 400) });
      }
    }
  }
  return out;
}

export const rulesProvider: AiProvider = { name: "rules", extractResume: async (t) => extractWithRules(t) };
