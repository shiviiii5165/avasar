import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { extractResumeSafely } from "../ai";
import { ground } from "../ai/grounding";
import { documentText } from "../ai/text";
import type { ResumeExtraction } from "../ai/types";
import { audit } from "../audit";
import type { Db } from "../db/client";
import { resumes } from "../db/schema";
import { normalizeSkill } from "../domain/skills";
import { educationLevelFrom } from "../integrations/tathastu-profile";
import { readDocumentForViewer } from "./documents";
import { addSectionItem, loadProfile, replaceSkills } from "./profiles";

/**
 * Resume intelligence. Suggestions only: nothing is written until the student ticks items and confirms.
 * Confirmed items become the student's own Avsar records (source 'avsar'); AI Tathastu records are never
 * changed. Items already on the profile are not suggested again.
 */
export class ResumeIntelError extends Error {}

async function resumeText(db: Db, identityId: string, profileId: string, resumeId: string) {
  if (!z.string().uuid().safeParse(resumeId).success) throw new ResumeIntelError("Resume not found");
  const [r] = await db.select().from(resumes).where(and(eq(resumes.id, resumeId), eq(resumes.profileId, profileId)));
  if (!r) throw new ResumeIntelError("Resume not found");
  const found = await readDocumentForViewer(db, r.documentId, { id: identityId, canViewAny: false });
  if (!found) throw new ResumeIntelError("Resume not found");
  try {
    return await documentText(found.bytes, found.doc.mimeType);
  } catch (err) {
    throw new ResumeIntelError(err instanceof Error ? err.message : "This resume couldn't be read.");
  }
}

const k = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Removes items that the profile already has (from either source), so nothing is asked twice. */
export function withoutExisting(x: ResumeExtraction, p: NonNullable<Awaited<ReturnType<typeof loadProfile>>>): ResumeExtraction {
  const skills = new Set(p.skills.map((s) => s.normalized));
  const inst = new Set(p.education.map((e) => k(e.institution)));
  const roles = new Set(p.experiences.map((e) => `${k(e.title)}|${k(e.organization)}`));
  const projects = new Set(p.projects.map((x) => k(x.title)));
  const certs = new Set([...p.certifications.map((c) => k(c.name)), ...p.achievements.map((a) => k(a.title))]);
  return {
    skills: x.skills.filter((s) => !skills.has(normalizeSkill(s.name))),
    education: x.education.filter((e) => !inst.has(k(e.institution))),
    experience: x.experience.filter((e) => !roles.has(`${k(e.title)}|${k(e.organization)}`)),
    projects: x.projects.filter((e) => !projects.has(k(e.title))),
    certifications: x.certifications.filter((c) => !certs.has(k(c.name))),
  };
}

export async function suggestFromResume(db: Db, identityId: string, profileId: string, resumeId: string) {
  const text = await resumeText(db, identityId, profileId, resumeId);
  const { result, rejected, provider, fellBack } = await extractResumeSafely(text);
  const profile = (await loadProfile(db, profileId))!;
  return { suggestions: withoutExisting(result, profile), rejected, provider, fellBack };
}

/**
 * Applies the items the student confirmed. The submitted items are re-checked against the resume text on
 * the server, so a tampered form can't add anything the resume doesn't say.
 */
export async function applyResumeSuggestions(db: Db, identityId: string, profileId: string, resumeId: string, chosen: ResumeExtraction) {
  const text = await resumeText(db, identityId, profileId, resumeId);
  const profile = (await loadProfile(db, profileId))!;
  const { kept } = ground(chosen, text);
  const items = withoutExisting(kept, profile);

  if (items.skills.length) {
    const own = profile.skills.filter((s) => s.source === "avsar").map((s) => s.name);
    await replaceSkills(db, profileId, [...own, ...items.skills.map((s) => s.name)]);
  }
  for (const e of items.education) await addSectionItem(db, profileId, "education", { institution: e.institution, level: educationLevelFrom(e.degree ?? null, e.field ?? null), degree: e.degree ?? null, field: e.field ?? null, graduationYear: e.graduationYear ?? null });
  for (const e of items.experience) await addSectionItem(db, profileId, "experience", { organization: e.organization, title: e.title, kind: /\bintern/i.test(e.title) ? "internship" : "unspecified", startDate: null, endDate: null, current: /present|current|now/i.test(e.endDate ?? ""), description: null });
  for (const p of items.projects) await addSectionItem(db, profileId, "project", { title: p.title, description: p.description ?? null, url: null, skills: [] });
  for (const c of items.certifications) await addSectionItem(db, profileId, "certification", { name: c.name, issuer: c.issuer ?? null, issuedOn: null, url: null });

  const counts = { skills: items.skills.length, education: items.education.length, experience: items.experience.length, projects: items.projects.length, certifications: items.certifications.length };
  await audit(db, { actorId: identityId, actorRole: "candidate", action: "profile.resume_suggestions_applied", targetType: "profile", targetId: profileId, metadata: counts });
  return counts;
}
