"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCandidate, requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { userIdentities } from "@/server/db/schema";
import { ApplyError, changeApplicationStatus, submitApplication } from "@/server/services/applications";
import { deleteResume, setDefaultResume, storage, uploadResume, UploadError } from "@/server/services/documents";
import { deleteSavedSearch, saveSearch, toggleSaved } from "@/server/services/engagement";
import { markAllRead, NOTIFICATION_KINDS, setPreference, type NotificationKind } from "@/server/services/notifications";
import { getOpportunityBySlug, toFacts } from "@/server/services/opportunities";
import { matchOpportunity } from "@/server/domain/matching";
import { requirementQuestions, unansweredRequirements } from "@/server/domain/requirements";
import {
  addSectionItem,
  eraseCandidateData,
  loadProfile,
  profileSchemas,
  toCandidateFacts,
  removeSectionItem,
  replaceSkills,
  setSkillLevel,
  updateProfileFields,
  type Section,
} from "@/server/services/profiles";
import { fileReport, openTicket, reportSchema, supportSchema } from "@/server/services/trust";
import { audit } from "@/server/audit";
import { rateLimit, TOO_MANY } from "@/server/rate-limit";

export type ActionState = { ok: boolean; message?: string; errors?: Record<string, string> } | null;

const fieldErrors = (e: z.ZodError) => Object.fromEntries(e.issues.map((i) => [String(i.path[0] ?? "form"), i.message]));
const formObject = (fd: FormData) => {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$")) continue;
    const all = fd.getAll(key);
    out[key] = all.length > 1 || key.endsWith("[]") ? all.map(String) : String(all[0]);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k.replace(/\[\]$/, ""), v]));
};

// ─── Saved & reports ───────────────────────────────────────────────────────
export async function toggleSaveAction(opportunityId: string, path: string) {
  const s = await requireUser(path);
  try {
    await toggleSaved(await getDb(), s.identity.id, z.string().uuid().parse(opportunityId));
  } catch {
    return { ok: false, message: "This opportunity is no longer available." };
  }
  revalidatePath(path);
  revalidatePath("/app/saved");
  return { ok: true };
}

export async function reportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  if (!(await rateLimit(await getDb(), "report", `id:${s.identity.id}`)).ok) return { ok: false, message: TOO_MANY };
  const parsed = reportSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await fileReport(await getDb(), s.identity.id, parsed.data);
    return { ok: true, message: "Thank you. Our trust team will review this listing." };
  } catch (err) {
    return { ok: false, message: err instanceof Error && err.message === "RATE_LIMITED" ? "You've sent several reports recently. Please try again later." : "We couldn't file the report. Please try again." };
  }
}

export async function supportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { getSession } = await import("@/server/auth/session");
  const s = await getSession();
  const parsed = supportSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  if (!s && !parsed.data.email) return { ok: false, errors: { email: "Add an email so we can reply." } };
  await openTicket(await getDb(), s?.identity.id ?? null, parsed.data);
  return { ok: true, message: "Thanks. We've received your message and will reply by email." };
}

// ─── Profile (Avsar-owned fields and additions; AI Tathastu-owned data is changed on AI Tathastu) ───
const PROFILE_FIELDS = ["basics", "stage", "interests", "roles", "locations", "workModes", "compensation", "availability", "links", "visibility"] as const;

export async function saveProfileFieldsAction(kind: (typeof PROFILE_FIELDS)[number], _: ActionState, fd: FormData): Promise<ActionState> {
  if (!PROFILE_FIELDS.includes(kind)) return { ok: false, message: "Unknown section" };
  const s = await requireCandidate();
  const parsed = profileSchemas[kind].safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const db = await getDb();
  await updateProfileFields(db, s.profileId, parsed.data as never);
  if (kind === "visibility") await audit(db, { actorId: s.identity.id, actorRole: "candidate", action: "profile.visibility", targetType: "profile", targetId: s.profileId, metadata: parsed.data });
  revalidatePath("/app", "layout");
  return { ok: true, message: "Saved" };
}

/** Skills the student adds in Avsar (imported skills are shown separately and owned by AI Tathastu). */
export async function saveSkillsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireCandidate();
  const parsed = profileSchemas.skills.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  await replaceSkills(await getDb(), s.profileId, parsed.data.skills);
  revalidatePath("/app", "layout");
  return { ok: true, message: "Skills saved" };
}

export async function setSkillLevelAction(skillId: string, fd: FormData) {
  const s = await requireCandidate();
  const level = z.enum(["beginner", "intermediate", "advanced", "expert"]).nullable().catch(null).parse(fd.get("level") || null);
  await setSkillLevel(await getDb(), s.profileId, z.string().uuid().parse(skillId), level);
  revalidatePath("/app/profile");
}

export async function addSectionAction(section: Section, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!["education", "experience", "project", "certification"].includes(section)) return { ok: false, message: "Unknown section" };
  const s = await requireCandidate();
  const parsed = profileSchemas[section].safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await addSectionItem(await getDb(), s.profileId, section, parsed.data as Record<string, unknown>);
  } catch {
    return { ok: false, message: "You've reached the limit for this section." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "Added" };
}

export async function removeSectionAction(section: Section, id: string) {
  const s = await requireCandidate();
  await removeSectionItem(await getDb(), s.profileId, section, z.string().uuid().parse(id));
  revalidatePath("/app", "layout");
}

// ─── Resumes ───────────────────────────────────────────────────────────────
export async function uploadResumeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireCandidate();
  if (!(await rateLimit(await getDb(), "upload", `id:${s.identity.id}`)).ok) return { ok: false, message: TOO_MANY };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: { file: "Choose a PDF or Word file." } };
  if (file.size > 5 * 1024 * 1024) return { ok: false, errors: { file: "Files must be 5 MB or smaller." } };
  try {
    await uploadResume(await getDb(), { identityId: s.identity.id, profileId: s.profileId }, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, String(fd.get("label") ?? ""));
  } catch (err) {
    if (err instanceof UploadError) return { ok: false, errors: { file: err.message } };
    console.error("[resume] upload failed:", err instanceof Error ? err.message : err);
    return { ok: false, message: "Upload failed. Your file wasn't saved; please try again." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "Resume uploaded. It stays private: uploading never makes you discoverable." };
}

export async function deleteResumeAction(resumeId: string) {
  const s = await requireCandidate();
  await deleteResume(await getDb(), { identityId: s.identity.id, profileId: s.profileId }, z.string().uuid().parse(resumeId));
  revalidatePath("/app", "layout");
}

export async function defaultResumeAction(resumeId: string) {
  const s = await requireCandidate();
  await setDefaultResume(await getDb(), s.profileId, z.string().uuid().parse(resumeId));
  revalidatePath("/app/profile");
}

// ─── Applications ──────────────────────────────────────────────────────────
export async function applyAction(slug: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireCandidate(`/app/apply/${slug}`);
  const db = await getDb();
  const opp = await getOpportunityBySlug(db, slug);
  if (!opp) return { ok: false, message: "This opportunity is no longer accepting applications." };
  if (!(await rateLimit(db, "apply", `profile:${s.profileId}`)).ok) return { ok: false, message: TOO_MANY };
  const profile = await loadProfile(db, s.profileId);
  if (!profile) return { ok: false, message: "Your profile couldn't be loaded." };
  const answers: Record<string, string> = {};
  for (const q of opp.questions) answers[q.key] = String(fd.get(`q_${q.key}`) ?? "").slice(0, 4000);
  const key = z.string().min(10).max(80).catch(randomUUID()).parse(fd.get("idempotencyKey"));
  // Requirement questions are recomputed here from the opportunity and profile; the browser can't choose them.
  const requiredKeys = requirementQuestions(matchOpportunity(toCandidateFacts(profile), toFacts(opp)).eligibility);
  const req = z
    .object({
      graduationYear: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number({ message: "Enter a year" }).int().min(1950, "Enter a year between 1950 and 2045").max(2045, "Enter a year between 1950 and 2045").optional()),
      educationLevel: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.enum(["secondary", "higher_secondary", "diploma", "bachelors", "masters", "doctorate"], { message: "Choose your qualification" }).optional()),
      workAuthorizedIndia: z.preprocess((v) => (v === "yes" ? true : v === "no" ? false : undefined), z.boolean().optional()),
    })
    .safeParse({ graduationYear: fd.get("req_graduationYear"), educationLevel: fd.get("req_educationLevel"), workAuthorizedIndia: fd.get("req_workAuthorizedIndia") });
  if (!req.success) return { ok: false, errors: Object.fromEntries(Object.entries(fieldErrors(req.error)).map(([k, v]) => [`req_${k}`, v])) };
  const missingReq = unansweredRequirements(requiredKeys, req.data);
  if (missingReq.length) {
    const field = { graduation_year: "req_graduationYear", education: "req_educationLevel", work_authorization: "req_workAuthorizedIndia" } as const;
    return { ok: false, errors: Object.fromEntries(missingReq.map((k) => [field[k], "This opportunity requires an answer."])) };
  }
  try {
    const { application } = await submitApplication(db, profile, s.identity.id, {
      opportunityId: opp.id,
      resumeId: (fd.get("resumeId") as string) || null,
      answers,
      consent: fd.get("consent") === "on",
      idempotencyKey: `${s.profileId}:${key}`,
      requiredKeys,
      requirementAnswers: req.data,
      saveAnswersToProfile: fd.get("saveAnswers") === "on",
    });
    revalidatePath("/app", "layout");
    redirect(`/app/applications/${application.id}?submitted=1`);
  } catch (err) {
    if (err instanceof ApplyError) return { ok: false, message: err.message };
    throw err; // includes Next's redirect signal
  }
}

export async function withdrawAction(applicationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireCandidate();
  try {
    await changeApplicationStatus(await getDb(), z.string().uuid().parse(applicationId), "withdrawn", { id: s.identity.id, role: "candidate" }, String(fd.get("reason") ?? "").slice(0, 300) || undefined, s.profileId);
  } catch {
    return { ok: false, message: "This application can't be withdrawn now." };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "Application withdrawn." };
}

// ─── Searches, notifications, account ──────────────────────────────────────
export async function saveSearchAction(fd: FormData) {
  const s = await requireUser("/opportunities");
  const query = Object.fromEntries([...fd.entries()].filter(([k, v]) => k !== "name" && typeof v === "string" && v).map(([k, v]) => [k, String(v)]));
  await saveSearch(await getDb(), s.identity.id, String(fd.get("name") || "My search"), query).catch(() => undefined);
  revalidatePath("/app/saved");
}

export async function deleteSavedSearchAction(id: string) {
  const s = await requireUser();
  await deleteSavedSearch(await getDb(), s.identity.id, z.string().uuid().parse(id));
  revalidatePath("/app/saved");
}

export async function markNotificationsReadAction() {
  const s = await requireUser();
  await markAllRead(await getDb(), s.identity.id);
  revalidatePath("/app", "layout");
}

export async function notificationPrefsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  const db = await getDb();
  for (const kind of Object.keys(NOTIFICATION_KINDS) as NotificationKind[]) {
    await setPreference(db, s.identity.id, kind, fd.get(`${kind}_inapp`) === "on", fd.get(`${kind}_email`) === "on");
  }
  return { ok: true, message: "Preferences saved" };
}

/** Account deletion: disables the identity, revokes sessions and removes profile data. Applications already sent stay with the organization as submitted. */
export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  if (fd.get("confirm") !== "DELETE") return { ok: false, errors: { confirm: "Type DELETE to confirm." } };
  const db = await getDb();
  const { sessions } = await import("@/server/db/schema");
  const keys = s.profileId ? await eraseCandidateData(db, s.profileId) : [];
  await db.transaction(async (tx) => {
    await tx.update(userIdentities).set({ deletedAt: new Date(), email: null, name: null }).where(eq(userIdentities.id, s.identity.id));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.identityId, s.identity.id));
    await audit(tx, { actorId: s.identity.id, actorRole: "candidate", action: "account.delete", targetType: "identity", targetId: s.identity.id });
  });
  for (const key of keys) await storage().remove(key).catch(() => undefined);
  redirect("/?account_deleted=1");
}
