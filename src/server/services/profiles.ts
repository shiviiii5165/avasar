import "server-only";

import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "../db/client";
import { achievements, candidateProfiles, candidateSkills, certifications, documents, education, experiences, projects, resumes, skillEvidence } from "../db/schema";
import { normalizeSkill, parseSkillList } from "../domain/skills";
import type { CandidateFacts, EducationLevel, SkillLevel, WorkMode } from "../domain/types";

export type Profile = typeof candidateProfiles.$inferSelect;

export async function ensureProfile(db: Db, identityId: string, name: string | null) {
  const [row] = await db.insert(candidateProfiles).values({ identityId, fullName: name }).onConflictDoNothing().returning();
  if (row) return row;
  const [existing] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.identityId, identityId));
  return existing;
}

export async function loadProfile(db: Db, profileId: string) {
  const [profile] = await db.select().from(candidateProfiles).where(eq(candidateProfiles.id, profileId));
  if (!profile) return null;
  const [edu, exp, proj, certs, skills, resumeRows] = await Promise.all([
    db.select().from(education).where(eq(education.profileId, profileId)).orderBy(education.graduationYear),
    db.select().from(experiences).where(eq(experiences.profileId, profileId)).orderBy(experiences.startDate),
    db.select().from(projects).where(eq(projects.profileId, profileId)),
    db.select().from(certifications).where(eq(certifications.profileId, profileId)),
    db.select().from(candidateSkills).where(eq(candidateSkills.profileId, profileId)).orderBy(candidateSkills.name),
    db.select({ resume: resumes, doc: documents }).from(resumes).innerJoin(documents, eq(resumes.documentId, documents.id)).where(and(eq(resumes.profileId, profileId), isNull(documents.deletedAt))),
  ]);
  const evidence = skills.length
    ? await db.select({ skillId: skillEvidence.skillId, n: count() }).from(skillEvidence).where(inArray(skillEvidence.skillId, skills.map((s) => s.id))).groupBy(skillEvidence.skillId)
    : [];
  // Evidence: explicit links, plus projects that list the skill.
  const projectSkills = proj.flatMap((p) => p.skills.map(normalizeSkill));
  const skillsWithEvidence = skills.map((s) => ({
    ...s,
    evidenceCount: (evidence.find((e) => e.skillId === s.id)?.n ?? 0) + projectSkills.filter((k) => k === s.normalized).length,
  }));
  const achievementRows = await db.select().from(achievements).where(eq(achievements.profileId, profileId));
  return { profile, education: edu, experiences: exp, projects: proj, certifications: certs, achievements: achievementRows, skills: skillsWithEvidence, resumes: resumeRows };
}
export type LoadedProfile = NonNullable<Awaited<ReturnType<typeof loadProfile>>>;

export function toCandidateFacts(p: LoadedProfile): CandidateFacts {
  return {
    education: [
      ...p.education.map((e) => ({ level: (e.level as EducationLevel | null) ?? null, graduationYear: e.graduationYear, field: e.field })),
      // Avsar-owned answers given in the context of an application (only used where imported records lack them).
      ...((() => {
        const level = p.profile.educationLevel && !p.education.some((e) => e.level) ? (p.profile.educationLevel as EducationLevel) : null;
        const year = p.profile.graduationYear && !p.education.some((e) => e.graduationYear) ? p.profile.graduationYear : null;
        return level || year ? [{ level, graduationYear: year, field: null }] : [];
      })()),
    ],
    experiences: p.experiences.map((e) => ({ kind: e.kind, startDate: e.startDate, endDate: e.endDate, current: e.current })),
    skills: p.skills.map((s) => ({ name: s.name, level: (s.level as SkillLevel | null) ?? null, evidenceCount: s.evidenceCount })),
    certifications: p.certifications.map((c) => c.name),
    city: p.profile.city,
    country: p.profile.country,
    workAuthorizedIndia: p.profile.workAuthorizedIndia,
    preferredLocations: p.profile.preferredLocations,
    workModes: p.profile.workModes as WorkMode[],
    preferredRoles: p.profile.preferredRoles,
    preferredCategories: p.profile.preferredCategories,
    expectedCompMin: p.profile.expectedCompMin,
    compPeriod: p.profile.compPeriod,
    availableFrom: p.profile.availableFrom,
  };
}

// ─── Validated updates (each one scoped to the caller's own profile) ──────────
const str = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const list = (max: number) => z.string().max(max).default("").transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 15));
const url = z.string().trim().max(300).optional().transform((v) => (v ? v : null)).refine((v) => v === null || /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(v), "Use a full https:// link");
const year = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1950).max(2045).nullable());
const date = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable()).transform((v) => (v && v.length === 7 ? `${v}-01` : v));

export const profileSchemas = {
  basics: z.object({ fullName: z.string().trim().min(2).max(100), headline: str(140), city: str(60), region: str(60) }),
  stage: z.object({ careerStage: z.enum(["student", "fresher", "early_career", "experienced", "career_switcher"]) }),
  interests: z.object({ interests: list(400), preferredCategories: z.array(z.enum(["job", "internship", "gig"])).default([]) }),
  roles: z.object({ preferredRoles: list(400) }),
  locations: z.object({ preferredLocations: list(400) }),
  workModes: z.object({ workModes: z.array(z.enum(["remote", "hybrid", "onsite"])).default([]) }),
  compensation: z.object({
    expectedCompMin: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(100_000_000).nullable()),
    compPeriod: z.preprocess((v) => (v === "" ? null : v), z.enum(["year", "month", "project"]).nullable()),
  }),
  availability: z.object({
    availableFrom: date,
    hoursPerWeek: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(80).nullable()),
    workAuthorizedIndia: z.preprocess((v) => (v === "yes" ? true : v === "no" ? false : null), z.boolean().nullable()),
  }),
  links: z.object({ linkedinUrl: url, githubUrl: url, portfolioUrl: url }),
  visibility: z.object({ visibility: z.enum(["private", "application", "discoverable"]) }),
  education: z.object({
    institution: z.string().trim().min(2).max(150),
    level: z.enum(["secondary", "higher_secondary", "diploma", "bachelors", "masters", "doctorate"]),
    degree: str(100),
    field: str(100),
    startYear: year,
    graduationYear: year,
    grade: str(30),
  }),
  experience: z.object({
    organization: z.string().trim().min(2).max(150),
    title: z.string().trim().min(2).max(120),
    kind: z.enum(["full_time", "part_time", "internship", "freelance", "volunteer"]),
    startDate: date,
    endDate: date,
    current: z.preprocess((v) => v === "on" || v === true, z.boolean()),
    description: str(2000),
  }),
  project: z.object({ title: z.string().trim().min(2).max(120), description: str(2000), url, skills: z.string().max(400).default("").transform(parseSkillList) }),
  certification: z.object({ name: z.string().trim().min(2).max(150), issuer: str(120), issuedOn: date, url }),
  skills: z.object({ skills: z.string().max(1500).transform(parseSkillList) }),
};

export type ProfileField = Exclude<keyof typeof profileSchemas, "education" | "experience" | "project" | "certification" | "skills">;

export async function updateProfileFields(db: Db, profileId: string, data: Partial<Profile>) {
  await db.update(candidateProfiles).set({ ...data, updatedAt: new Date() }).where(eq(candidateProfiles.id, profileId));
}

export async function replaceSkills(db: Db, profileId: string, names: string[]) {
  await db.transaction(async (tx) => {
    // Only the student's own (Avsar) skills are edited here; imported ones belong to AI Tathastu.
    const all = await tx.select().from(candidateSkills).where(eq(candidateSkills.profileId, profileId));
    const own = all.filter((c) => c.source === "avsar");
    const wanted = new Map(names.map((n) => [normalizeSkill(n), n]));
    const remove = own.filter((c) => !wanted.has(c.normalized)).map((c) => c.id);
    if (remove.length) await tx.delete(candidateSkills).where(inArray(candidateSkills.id, remove));
    const add = [...wanted].filter(([k]) => !all.some((c) => c.normalized === k)).map(([normalized, name]) => ({ profileId, name, normalized, source: "avsar" as const }));
    if (add.length) await tx.insert(candidateSkills).values(add);
  });
}

export async function setSkillLevel(db: Db, profileId: string, skillId: string, level: SkillLevel | null) {
  await db.update(candidateSkills).set({ level }).where(and(eq(candidateSkills.id, skillId), eq(candidateSkills.profileId, profileId)));
}

/**
 * Erases a candidate's profile data (account deletion). Sections, skills and resumes are removed and
 * personal fields scrubbed; the profile row stays only as an anonymous anchor for applications already
 * submitted (which keep their snapshot, as disclosed in the consent). Returns storage keys to delete.
 */
export async function eraseCandidateData(db: Db, profileId: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    for (const t of [education, experiences, projects, certifications, achievements, candidateSkills]) await tx.delete(t).where(eq(t.profileId, profileId));
    const docs = await tx.select({ id: documents.id, key: documents.storageKey }).from(resumes).innerJoin(documents, eq(resumes.documentId, documents.id)).where(eq(resumes.profileId, profileId));
    await tx.delete(resumes).where(eq(resumes.profileId, profileId));
    if (docs.length) await tx.update(documents).set({ deletedAt: new Date() }).where(inArray(documents.id, docs.map((d) => d.id)));
    await tx.update(candidateProfiles).set({
      fullName: null, headline: null, bio: null, city: null, region: null, careerStage: null, visibility: "private",
      preferredRoles: [], preferredLocations: [], preferredCategories: [], workModes: [], interests: [],
      expectedCompMin: null, availableFrom: null, hoursPerWeek: null, workAuthorizedIndia: null,
      linkedinUrl: null, githubUrl: null, portfolioUrl: null, graduationYear: null,
      importedFields: {}, aitScopes: {}, aitSyncStatus: "never", aitSyncError: null, aitSyncedAt: null, updatedAt: new Date(),
    }).where(eq(candidateProfiles.id, profileId));
    return docs.map((d) => d.key);
  });
}

const SECTION_TABLE = { education, experience: experiences, project: projects, certification: certifications } as const;
export type Section = keyof typeof SECTION_TABLE;

export async function addSectionItem(db: Db, profileId: string, section: Section, values: Record<string, unknown>) {
  const table = SECTION_TABLE[section];
  const count = await db.select({ id: table.id }).from(table).where(eq(table.profileId, profileId));
  if (count.length >= 30) throw new Error("LIMIT");
  await db.insert(table).values({ ...values, profileId } as never);
}

export async function removeSectionItem(db: Db, profileId: string, section: Section, id: string) {
  const table = SECTION_TABLE[section];
  // Scoped by profileId (never another candidate's records) and to the student's own rows: imported rows are
  // owned by AI Tathastu and would return on the next sync, so they're changed there instead.
  await db.delete(table).where(and(eq(table.id, id), eq(table.profileId, profileId), eq(table.source, "avsar")));
}
