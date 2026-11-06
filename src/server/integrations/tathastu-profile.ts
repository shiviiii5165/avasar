/**
 * AI Tathastu ProfessionalProjectionV1 → Avsar profile records.
 *
 * Contract verified against AI Tathastu's source (src/lib/integrations/projection.ts and
 * GET /api/integrations/v1/profile): a section the student didn't share is `null` and listed in
 * `privacy.masked`. Parsing is tolerant (unknown keys ignored) but typed; mapping is explicit.
 *
 * Rules: nothing is invented. A value AI Tathastu doesn't send stays unknown (null), never empty,
 * false or "ineligible". Levels and dates are derived only when the source text states them clearly.
 */
import { z } from "zod";

import { normalizeSkill } from "../domain/skills";
import type { EducationLevel, SkillLevel } from "../domain/types";

const s = z.string().nullish().transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null));
const arr = <T extends z.ZodTypeAny>(t: T) => z.array(t).nullish();

export const projectionSchema = z.object({
  schema: z.literal("ProfessionalProjectionV1"),
  version: z.number(),
  identity: z.object({
    id: z.string().min(1),
    email: s,
    name: s,
    headline: s,
    avatarUrl: s,
    careerRole: z.object({ id: z.string(), label: z.string() }).nullish(),
    location: z.object({ city: s, country: s }).nullish(),
  }),
  education: arr(z.object({ institution: s, degree: s, fieldOfStudy: s, dates: s, grade: s })),
  skills: z
    .object({
      items: z.array(z.object({ name: z.string(), category: s, verified: z.boolean().nullish(), verificationStatus: s, proficiency: z.number().nullish(), level: s })),
    })
    .nullish(),
  projects: arr(z.object({ key: z.string(), title: z.string(), description: s, technologies: z.array(z.string()).nullish(), links: z.array(z.string()).nullish() })),
  experience: arr(z.object({ organization: s, role: s, dates: s, description: s })),
  achievements: arr(z.object({ type: z.string(), title: s, issuer: s, date: s, url: s })),
  privacy: z.object({ scopes: z.record(z.string(), z.boolean()).nullish(), masked: z.array(z.string()).nullish() }).nullish(),
});
export type Projection = z.infer<typeof projectionSchema>;

export interface MappedProfile {
  subject: string;
  identity: { fullName: string | null; headline: string | null; city: string | null; country: string | null; careerRole: string | null };
  education: { institution: string; level: EducationLevel | null; degree: string | null; field: string | null; startYear: number | null; graduationYear: number | null; grade: string | null; sourceKey: string }[] | null;
  skills: { name: string; normalized: string; level: SkillLevel | null; sourceKey: string }[] | null;
  projects: { title: string; description: string | null; url: string | null; skills: string[]; sourceKey: string }[] | null;
  experiences: { organization: string; title: string; kind: string; startDate: string | null; endDate: string | null; current: boolean; description: string | null; sourceKey: string }[] | null;
  certifications: { name: string; issuer: string | null; issuedOn: string | null; url: string | null; sourceKey: string }[] | null;
  achievements: { kind: string; title: string; issuer: string | null; date: string | null; url: string | null; sourceKey: string }[] | null;
  scopes: Record<string, boolean>;
  /** Sections the student chose not to share (null in the projection). */
  withheld: string[];
}

/** Level only when the degree text clearly names one. */
export function educationLevelFrom(degree: string | null, field?: string | null): EducationLevel | null {
  const t = `${degree ?? ""} ${field ?? ""}`.toLowerCase();
  if (/\b(ph\.?\s?d|doctorate|d\.phil)\b/.test(t)) return "doctorate";
  if (/\b(m\.?\s?tech|m\.?\s?e\b|m\.?\s?sc|m\.?\s?s\b|m\.?\s?a\b|m\.?\s?com|mba|mca|master)/.test(t)) return "masters";
  if (/\b(b\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|b\.?\s?a\b|b\.?\s?com|bba|bca|bachelor|undergraduate)/.test(t)) return "bachelors";
  if (/\bdiploma\b/.test(t)) return "diploma";
  if (/\b(class\s?12|12th|xii|hsc|higher secondary|intermediate)\b/.test(t)) return "higher_secondary";
  if (/\b(class\s?10|10th|ssc|secondary school)\b/.test(t)) return "secondary";
  return null;
}

/** "2022 – 2026", "Jun 2023 - Present", "2025" → years and ISO dates, only when stated. */
export function parseDateRange(dates: string | null): { start: string | null; end: string | null; current: boolean; startYear: number | null; endYear: number | null } {
  const empty = { start: null, end: null, current: false, startYear: null, endYear: null };
  if (!dates) return empty;
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const parts = dates.split(/\s*(?:–|—|-|to)\s*/i).map((p) => p.trim()).filter(Boolean);
  const one = (p: string | undefined) => {
    if (!p) return null;
    const y = p.match(/\b(19|20)\d{2}\b/)?.[0];
    if (!y) return null;
    const m = MONTHS.findIndex((mm) => p.toLowerCase().startsWith(mm) || p.toLowerCase().includes(` ${mm}`));
    return { year: Number(y), iso: `${y}-${String(m >= 0 ? m + 1 : 1).padStart(2, "0")}-01`, hasMonth: m >= 0 };
  };
  const a = one(parts[0]);
  const current = /present|current|now/i.test(parts[1] ?? "");
  const b = current ? null : one(parts[1] ?? (parts.length === 1 ? parts[0] : undefined));
  return {
    start: a?.hasMonth ? a.iso : a ? `${a.year}-01-01` : null,
    end: b?.hasMonth ? b.iso : b && parts.length > 1 ? `${b.year}-12-01` : null,
    current,
    startYear: a?.year ?? null,
    endYear: parts.length > 1 ? (b?.year ?? null) : (a?.year ?? null),
  };
}

const SKILL_LEVELS: SkillLevel[] = ["beginner", "intermediate", "advanced", "expert"];
const safeUrl = (u: string | null | undefined) => {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

export function mapProjection(p: Projection): MappedProfile {
  const nullSections = (["education", "skills", "projects", "experience", "achievements"] as const).filter((k) => p[k] == null);
  const withheld = [...new Set([...(p.privacy?.masked ?? []), ...nullSections])];
  const shared = (k: keyof Projection) => p[k] !== null && p[k] !== undefined;

  const education = shared("education")
    ? (p.education ?? [])
        .filter((e) => e.institution)
        .map((e, i) => {
          const d = parseDateRange(e.dates);
          return {
            institution: e.institution!,
            level: educationLevelFrom(e.degree, e.fieldOfStudy),
            degree: e.degree,
            field: e.fieldOfStudy,
            startYear: d.startYear !== d.endYear ? d.startYear : null,
            graduationYear: d.endYear,
            grade: e.grade,
            sourceKey: `edu:${i}:${(e.institution ?? "").toLowerCase()}`,
          };
        })
    : null;

  const seen = new Set<string>();
  const skills = p.skills
    ? p.skills.items
        .filter((it) => it.name.trim())
        .map((it) => {
          const lvl = it.level?.toLowerCase() as SkillLevel | undefined;
          return { name: it.name.trim().slice(0, 60), normalized: normalizeSkill(it.name), level: lvl && SKILL_LEVELS.includes(lvl) ? lvl : null, sourceKey: `skill:${normalizeSkill(it.name)}` };
        })
        .filter((it) => (seen.has(it.normalized) ? false : (seen.add(it.normalized), true)))
    : null;

  const projects = shared("projects")
    ? (p.projects ?? []).map((pr) => ({
        title: pr.title.slice(0, 120),
        description: pr.description,
        url: safeUrl(pr.links?.[0]),
        skills: [...new Set((pr.technologies ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 20),
        sourceKey: `proj:${pr.key}`,
      }))
    : null;

  const experiences = shared("experience")
    ? (p.experience ?? [])
        .filter((e) => e.organization || e.role)
        .map((e, i) => {
          const d = parseDateRange(e.dates);
          return {
            organization: e.organization ?? "Organization not stated",
            title: e.role ?? "Role not stated",
            kind: /\bintern/i.test(e.role ?? "") ? "internship" : "unspecified",
            startDate: d.start,
            endDate: d.end,
            current: d.current,
            description: e.description,
            sourceKey: `exp:${i}:${(e.organization ?? "").toLowerCase()}`,
          };
        })
    : null;

  const ach = shared("achievements") ? (p.achievements ?? []).filter((a) => a.title) : null;
  const certifications = ach
    ? ach.filter((a) => a.type === "certification").map((a, i) => ({ name: a.title!, issuer: a.issuer, issuedOn: parseDateRange(a.date).start, url: safeUrl(a.url), sourceKey: `cert:${i}:${a.title!.toLowerCase()}` }))
    : null;
  const achievements = ach
    ? ach.filter((a) => a.type !== "certification").map((a, i) => ({ kind: a.type === "publication" ? "publication" : "achievement", title: a.title!, issuer: a.issuer, date: a.date, url: safeUrl(a.url), sourceKey: `ach:${i}:${a.title!.toLowerCase()}` }))
    : null;

  return {
    subject: p.identity.id,
    identity: {
      fullName: p.identity.name,
      headline: p.identity.headline,
      city: p.identity.location?.city ?? null,
      country: p.identity.location?.country ?? null,
      careerRole: p.identity.careerRole?.label ?? null,
    },
    education,
    skills,
    projects,
    experiences,
    certifications,
    achievements,
    scopes: p.privacy?.scopes ?? {},
    withheld,
  };
}
