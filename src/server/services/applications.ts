import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { audit } from "../audit";
import type { Db } from "../db/client";
import { applicationAnswers, applicationEvents, applications, documents, opportunities, resumes } from "../db/schema";
import { canTransitionApplication, isPubliclyVisible, type Actor, type ApplicationStatus } from "../domain/workflows";
import { notify } from "./notifications";
import type { LoadedProfile } from "./profiles";

export const CONSENT_TEXT =
  "I confirm the information I'm submitting is accurate. I agree to share this application, my selected resume and the profile details shown with the organization for this opportunity only.";

export class ApplyError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "CLOSED" | "EXTERNAL" | "DUPLICATE" | "RESUME" | "ANSWERS" | "CONSENT", message: string) {
    super(message);
  }
}

export interface SubmitInput {
  opportunityId: string;
  resumeId: string | null;
  answers: Record<string, string>;
  consent: boolean;
  idempotencyKey: string;
}

/**
 * Submits an Avsar-hosted application in one transaction:
 *  - idempotent (same key → same application, never a duplicate),
 *  - one application per candidate per opportunity (DB unique constraint is the final guard),
 *  - the opportunity row is locked so a listing closing mid-submit can't accept a late application,
 *  - snapshots of profile, resume, answers, opportunity version and consent are stored.
 * The notification is queued after commit; a failed email can never undo a submitted application.
 */
export async function submitApplication(db: Db, profile: LoadedProfile, identityId: string, input: SubmitInput, now = new Date()) {
  const existing = await db.select().from(applications).where(eq(applications.idempotencyKey, input.idempotencyKey));
  if (existing[0]) {
    if (existing[0].profileId !== profile.profile.id) throw new ApplyError("DUPLICATE", "This request was already used.");
    return { application: existing[0], replayed: true };
  }
  if (!input.consent) throw new ApplyError("CONSENT", "Please confirm the declaration to submit.");

  const result = await db.transaction(async (tx) => {
    const [opp] = await tx.select().from(opportunities).where(eq(opportunities.id, input.opportunityId)).for("update");
    if (!opp) throw new ApplyError("NOT_FOUND", "This opportunity no longer exists.");
    if (!isPubliclyVisible({ status: opp.status, deadline: opp.deadline }, now)) throw new ApplyError("CLOSED", "Applications for this opportunity are closed.");
    if (opp.applicationMethod !== "internal") throw new ApplyError("EXTERNAL", "This opportunity is applied for on the organization's own site.");

    const [dupe] = await tx.select({ id: applications.id }).from(applications).where(and(eq(applications.opportunityId, opp.id), eq(applications.profileId, profile.profile.id)));
    if (dupe) throw new ApplyError("DUPLICATE", "You've already applied to this opportunity.");

    let resumeDocumentId: string | null = null;
    if (input.resumeId) {
      const [r] = await tx
        .select({ documentId: resumes.documentId })
        .from(resumes)
        .innerJoin(documents, eq(resumes.documentId, documents.id))
        .where(and(eq(resumes.id, input.resumeId), eq(resumes.profileId, profile.profile.id), isNull(documents.deletedAt)));
      if (!r) throw new ApplyError("RESUME", "Choose one of your own resumes.");
      resumeDocumentId = r.documentId;
    }

    const missing = opp.questions.filter((q) => q.required && !input.answers[q.key]?.trim());
    if (missing.length) throw new ApplyError("ANSWERS", `Please answer: ${missing.map((q) => q.label).join(", ")}`);

    const p = profile.profile;
    const snapshot = {
      fullName: p.fullName, headline: p.headline, city: p.city, region: p.region, careerStage: p.careerStage,
      education: profile.education.map(({ institution, level, degree, field, graduationYear }) => ({ institution, level, degree, field, graduationYear })),
      experiences: profile.experiences.map(({ organization, title, kind, startDate, endDate, current }) => ({ organization, title, kind, startDate, endDate, current })),
      projects: profile.projects.map(({ title, url, skills }) => ({ title, url, skills })),
      skills: profile.skills.map((s) => s.name),
      certifications: profile.certifications.map((c) => c.name),
      links: { linkedin: p.linkedinUrl, github: p.githubUrl, portfolio: p.portfolioUrl },
    };

    const [app] = await tx
      .insert(applications)
      .values({
        opportunityId: opp.id, profileId: p.id, status: "submitted", opportunityVersion: opp.version, resumeDocumentId,
        profileSnapshot: snapshot, consentText: CONSENT_TEXT, consentAt: now, idempotencyKey: input.idempotencyKey, submittedAt: now,
      })
      .returning();
    const answers = opp.questions.filter((q) => input.answers[q.key]?.trim()).map((q) => ({ applicationId: app.id, questionKey: q.key, question: q.label, answer: input.answers[q.key].trim().slice(0, 4000) }));
    if (answers.length) await tx.insert(applicationAnswers).values(answers);
    await tx.insert(applicationEvents).values({ applicationId: app.id, fromStatus: null, toStatus: "submitted", actorIdentityId: identityId, actorRole: "candidate" });
    await audit(tx, { actorId: identityId, actorRole: "candidate", action: "application.submit", targetType: "application", targetId: app.id, metadata: { opportunityId: opp.id } });
    return { application: app, opportunity: opp };
  });

  await notify(db, {
    identityId, kind: "application_submitted", dedupeKey: `application_submitted:${result.application.id}`,
    title: `Application submitted: ${result.opportunity.title}`, body: `${result.opportunity.organizationName} · we'll keep you updated here.`, link: `/app/applications/${result.application.id}`,
  }).catch((err) => console.error("[applications] notification failed (application kept):", err instanceof Error ? err.message : err));

  return { application: result.application, replayed: false };
}

export async function changeApplicationStatus(db: Db, applicationId: string, to: ApplicationStatus, actor: { id: string; role: Actor }, reason?: string, ownerProfileId?: string) {
  const res = await db.transaction(async (tx) => {
    const [app] = await tx.select().from(applications).where(eq(applications.id, applicationId)).for("update");
    if (!app) throw new Error("NOT_FOUND");
    if (actor.role === "candidate" && app.profileId !== ownerProfileId) throw new Error("NOT_FOUND"); // never reveal others' applications
    if (!canTransitionApplication(app.status, to, actor.role)) throw new Error(`INVALID_TRANSITION:${app.status}->${to}`);
    const [updated] = await tx.update(applications).set({ status: to, updatedAt: new Date() }).where(eq(applications.id, app.id)).returning();
    await tx.insert(applicationEvents).values({ applicationId: app.id, fromStatus: app.status, toStatus: to, actorIdentityId: actor.id, actorRole: actor.role, reason: reason?.slice(0, 500) ?? null });
    await audit(tx, { actorId: actor.id, actorRole: actor.role, action: "application.status", targetType: "application", targetId: app.id, metadata: { from: app.status, to } });
    return updated;
  });
  return res;
}

export async function listApplicationsForProfile(db: Db, profileId: string) {
  return db
    .select({ application: applications, opportunity: { id: opportunities.id, slug: opportunities.slug, title: opportunities.title, organizationName: opportunities.organizationName, category: opportunities.category, deadline: opportunities.deadline, isSample: opportunities.isSample } })
    .from(applications)
    .innerJoin(opportunities, eq(applications.opportunityId, opportunities.id))
    .where(eq(applications.profileId, profileId))
    .orderBy(desc(applications.submittedAt));
}

export async function getApplicationForProfile(db: Db, profileId: string, applicationId: string) {
  const [row] = await db
    .select({ application: applications, opportunity: opportunities })
    .from(applications)
    .innerJoin(opportunities, eq(applications.opportunityId, opportunities.id))
    .where(and(eq(applications.id, applicationId), eq(applications.profileId, profileId)));
  if (!row) return null;
  const [events, answers] = await Promise.all([
    db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, applicationId)).orderBy(applicationEvents.at),
    db.select().from(applicationAnswers).where(eq(applicationAnswers.applicationId, applicationId)),
  ]);
  return { ...row, events, answers };
}
