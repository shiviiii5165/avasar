import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, count, countDistinct, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { audit } from "../audit";
import type { Db } from "../db/client";
import {
  applicationAnswers, applicationEvents, applications, assessments, candidateProfiles, documents, internalNotes, interviews, messages,
  opportunities, organizationInvitations, organizationMembers, organizations, recentlyViewed, savedOpportunities, userIdentities, verificationEvidence, verificationRequests,
} from "../db/schema";
import { employerListingTransition, orgCan, type OrgPermission, type OrgRole, type OrgVerification } from "../domain/org-permissions";
import { APPLICATION_STATUS_LABEL, type ApplicationStatus, type OpportunityStatus } from "../domain/workflows";
import { changeApplicationStatus } from "./applications";
import { signedDocumentUrl } from "./documents";
import { enqueueJob } from "./jobs";
import { notify } from "./notifications";
import { createOpportunity, transitionOpportunity, TransitionError, updateOpportunity, type OpportunityInput } from "./opportunities";

/**
 * Employer Studio use cases. Every function takes the acting identity and the organization and checks
 * membership + permission itself, so isolation never depends on the caller. Records from another
 * organization are reported as NOT_FOUND (indistinguishable from missing).
 */
export class EmployerError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT", message: string) {
    super(message);
  }
}

export type Org = typeof organizations.$inferSelect;
export interface OrgContext { org: Org; role: OrgRole; can: (p: OrgPermission) => boolean }

export async function orgContext(db: Db, identityId: string, orgId: string): Promise<OrgContext | null> {
  if (!z.string().uuid().safeParse(orgId).success) return null;
  const [row] = await db
    .select({ org: organizations, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.orgId, organizations.id))
    .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.identityId, identityId)));
  if (!row) return null;
  const verification = row.org.verificationStatus as OrgVerification;
  return { org: row.org, role: row.role, can: (p) => orgCan(row.role, p, verification) };
}

/** Membership + permission, or throw. Non-members get NOT_FOUND so organizations can't be probed. */
export async function requireOrg(db: Db, identityId: string, orgId: string, permission: OrgPermission): Promise<OrgContext> {
  const ctx = await orgContext(db, identityId, orgId);
  if (!ctx) throw new EmployerError("NOT_FOUND", "Organization not found");
  if (!ctx.can(permission)) throw new EmployerError("FORBIDDEN", "Your role or your organization's verification status doesn't allow this.");
  return ctx;
}

export async function listMemberships(db: Db, identityId: string) {
  return db
    .select({ org: organizations, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.orgId, organizations.id))
    .where(eq(organizationMembers.identityId, identityId))
    .orderBy(organizations.name);
}

// ─── Organization profile & verification ──────────────────────────────────
const httpsUrl = z.string().trim().max(200).refine((v) => !v || /^https:\/\/[^\s]+\.[^\s]+$/.test(v), "Use a full https:// address").optional();
export const orgInput = z.object({
  name: z.string().trim().min(2, "Enter the organization's name").max(120),
  website: httpsUrl,
  domain: z.string().trim().toLowerCase().max(120).refine((v) => !v || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v), "Use a domain like example.com").optional(),
  description: z.string().trim().max(2000).optional(),
  industry: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
});
export type OrgInput = z.infer<typeof orgInput>;
const blank = (v?: string) => (v ? v : null);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "org";

export async function createOrganization(db: Db, identityId: string, input: OrgInput) {
  return db.transaction(async (tx) => {
    const slug = `${slugify(input.name)}-${randomBytes(3).toString("hex")}`;
    const [org] = await tx
      .insert(organizations)
      .values({ name: input.name, slug, website: blank(input.website), domain: blank(input.domain), description: blank(input.description), industry: blank(input.industry), city: blank(input.city), createdBy: identityId })
      .returning();
    await tx.insert(organizationMembers).values({ orgId: org.id, identityId, role: "owner" });
    await audit(tx, { actorId: identityId, actorRole: "employer", action: "organization.create", targetType: "organization", targetId: org.id });
    return org;
  });
}

export async function updateOrganization(db: Db, identityId: string, orgId: string, input: OrgInput) {
  const ctx = await requireOrg(db, identityId, orgId, "org.edit");
  // Changing the name or domain of a verified organization invalidates the verification evidence.
  const material = input.name !== ctx.org.name || blank(input.domain) !== ctx.org.domain;
  const reverify = material && ctx.org.verificationStatus === "verified";
  await db.transaction(async (tx) => {
    await tx
      .update(organizations)
      .set({ name: input.name, website: blank(input.website), domain: blank(input.domain), description: blank(input.description), industry: blank(input.industry), city: blank(input.city), updatedAt: new Date(), ...(reverify ? { verificationStatus: "unverified" as const, verifiedAt: null } : {}) })
      .where(eq(organizations.id, orgId));
    await audit(tx, { actorId: identityId, actorRole: "employer", action: "organization.update", targetType: "organization", targetId: orgId, metadata: { reverificationRequired: reverify } });
  });
  return { reverify };
}

export const verificationInput = z.object({
  representative: z.string().trim().min(3, "Name the person responsible and their position").max(200),
  registration: z.string().trim().max(120).optional(),
  officialEmailDomain: z.string().trim().toLowerCase().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function requestVerification(db: Db, identityId: string, orgId: string, input: z.infer<typeof verificationInput>) {
  const ctx = await requireOrg(db, identityId, orgId, "org.request_verification");
  if (["pending", "under_review", "verified"].includes(ctx.org.verificationStatus)) throw new EmployerError("CONFLICT", ctx.org.verificationStatus === "verified" ? "This organization is already verified." : "A verification request is already being reviewed.");
  if (ctx.org.verificationStatus === "suspended") throw new EmployerError("FORBIDDEN", "Suspended organizations can't request verification.");
  if (!ctx.org.website && !ctx.org.domain) throw new EmployerError("INVALID", "Add your official website or domain to the organization profile first.");
  return db.transaction(async (tx) => {
    const [req] = await tx.insert(verificationRequests).values({ orgId, status: "pending", submittedBy: identityId }).returning();
    const evidence = [
      { kind: "representative", value: input.representative },
      { kind: "website", value: ctx.org.website },
      { kind: "domain", value: input.officialEmailDomain || ctx.org.domain },
      { kind: "registration", value: input.registration || null },
      { kind: "document", value: input.notes || null },
    ].filter((e) => e.value);
    await tx.insert(verificationEvidence).values(evidence.map((e) => ({ requestId: req.id, kind: e.kind, value: e.value })));
    await tx.update(organizations).set({ verificationStatus: "pending", updatedAt: new Date() }).where(eq(organizations.id, orgId));
    await audit(tx, { actorId: identityId, actorRole: "employer", action: "verification.request", targetType: "organization", targetId: orgId });
    return req;
  });
}

export async function latestVerification(db: Db, orgId: string) {
  const [r] = await db.select().from(verificationRequests).where(eq(verificationRequests.orgId, orgId)).orderBy(desc(verificationRequests.createdAt)).limit(1);
  return r ?? null;
}

// ─── Members & invitations ─────────────────────────────────────────────────
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const INVITE_TTL_MS = 7 * 86_400_000;
const roleSchema = z.enum(["owner", "recruiter", "hiring_manager", "viewer"]);

export async function listMembers(db: Db, identityId: string, orgId: string) {
  await requireOrg(db, identityId, orgId, "opportunity.view");
  return db
    .select({ identityId: organizationMembers.identityId, role: organizationMembers.role, since: organizationMembers.createdAt, name: userIdentities.name })
    .from(organizationMembers)
    .innerJoin(userIdentities, eq(organizationMembers.identityId, userIdentities.id))
    .where(eq(organizationMembers.orgId, orgId))
    .orderBy(organizationMembers.createdAt);
}

export async function listInvitations(db: Db, identityId: string, orgId: string) {
  await requireOrg(db, identityId, orgId, "member.manage");
  return db
    .select({ id: organizationInvitations.id, email: organizationInvitations.email, role: organizationInvitations.role, expiresAt: organizationInvitations.expiresAt, createdAt: organizationInvitations.createdAt })
    .from(organizationInvitations)
    .where(and(eq(organizationInvitations.orgId, orgId), isNull(organizationInvitations.acceptedAt), isNull(organizationInvitations.revokedAt)))
    .orderBy(desc(organizationInvitations.createdAt));
}

export async function inviteMember(db: Db, identityId: string, orgId: string, raw: { email: unknown; role: unknown }, now = new Date()) {
  const ctx = await requireOrg(db, identityId, orgId, "member.manage");
  const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(200).parse(raw.email);
  const role = roleSchema.parse(raw.role);
  const token = randomBytes(32).toString("base64url");
  const link = `/studio/invite/${token}`;
  await db.transaction(async (tx) => {
    const [inv] = await tx.insert(organizationInvitations).values({ orgId, email, role, tokenHash: hashToken(token), invitedBy: identityId, expiresAt: new Date(now.getTime() + INVITE_TTL_MS) }).returning();
    // Delivered through the email adapter (a development sink unless a provider is configured).
    await enqueueJob(tx, "email.invitation", { to: email, orgName: ctx.org.name, link }, `invite:${inv.id}`);
    await audit(tx, { actorId: identityId, actorRole: "employer", action: "organization.invite", targetType: "organization", targetId: orgId, metadata: { role } });
  });
  return { link };
}

/** Accepting needs the one-time token AND a signed-in identity. The invited email is never used to link accounts. */
export async function acceptInvitation(db: Db, identityId: string, token: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(organizationInvitations).where(eq(organizationInvitations.tokenHash, hashToken(token))).for("update");
    if (!inv || inv.revokedAt || inv.acceptedAt) throw new EmployerError("NOT_FOUND", "This invitation is no longer valid.");
    if (inv.expiresAt.getTime() <= now.getTime()) throw new EmployerError("INVALID", "This invitation has expired. Ask for a new one.");
    const [existing] = await tx.select().from(organizationMembers).where(and(eq(organizationMembers.orgId, inv.orgId), eq(organizationMembers.identityId, identityId)));
    if (existing) throw new EmployerError("CONFLICT", "You're already a member of this organization.");
    await tx.insert(organizationMembers).values({ orgId: inv.orgId, identityId, role: inv.role });
    await tx.update(organizationInvitations).set({ acceptedAt: now, acceptedBy: identityId }).where(eq(organizationInvitations.id, inv.id));
    await audit(tx, { actorId: identityId, actorRole: "employer", action: "organization.join", targetType: "organization", targetId: inv.orgId, metadata: { role: inv.role } });
    return inv.orgId;
  });
}

export async function revokeInvitation(db: Db, identityId: string, orgId: string, invitationId: string) {
  await requireOrg(db, identityId, orgId, "member.manage");
  const rows = await db.update(organizationInvitations).set({ revokedAt: new Date() }).where(and(eq(organizationInvitations.id, invitationId), eq(organizationInvitations.orgId, orgId), isNull(organizationInvitations.acceptedAt))).returning();
  if (!rows.length) throw new EmployerError("NOT_FOUND", "Invitation not found");
  await audit(db, { actorId: identityId, actorRole: "employer", action: "organization.invite_revoke", targetType: "organization", targetId: orgId });
}

async function ownerCount(db: Pick<Db, "select">, orgId: string) {
  const [r] = await db.select({ n: count() }).from(organizationMembers).where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.role, "owner")));
  return r.n;
}

export async function changeMemberRole(db: Db, identityId: string, orgId: string, memberId: string, rawRole: unknown) {
  await requireOrg(db, identityId, orgId, "member.manage");
  const role = roleSchema.parse(rawRole);
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(organizationMembers).where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.identityId, memberId))).for("update");
    if (!m) throw new EmployerError("NOT_FOUND", "Member not found");
    if (m.role === "owner" && role !== "owner" && (await ownerCount(tx, orgId)) <= 1) throw new EmployerError("CONFLICT", "An organization needs at least one owner.");
    await tx.update(organizationMembers).set({ role }).where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.identityId, memberId)));
    await audit(tx, { actorId: identityId, actorRole: "employer", action: "organization.member_role", targetType: "organization", targetId: orgId, metadata: { memberId, from: m.role, to: role } });
  });
}

export async function removeMember(db: Db, identityId: string, orgId: string, memberId: string) {
  await requireOrg(db, identityId, orgId, "member.manage");
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(organizationMembers).where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.identityId, memberId))).for("update");
    if (!m) throw new EmployerError("NOT_FOUND", "Member not found");
    if (m.role === "owner" && (await ownerCount(tx, orgId)) <= 1) throw new EmployerError("CONFLICT", "An organization needs at least one owner.");
    await tx.delete(organizationMembers).where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.identityId, memberId)));
    await audit(tx, { actorId: identityId, actorRole: "employer", action: "organization.member_remove", targetType: "organization", targetId: orgId, metadata: { memberId } });
  });
}

// ─── Listings ──────────────────────────────────────────────────────────────
export async function listOrgOpportunities(db: Db, identityId: string, orgId: string) {
  await requireOrg(db, identityId, orgId, "opportunity.view");
  const apps = db.select({ opportunityId: applications.opportunityId, n: count().as("n") }).from(applications).groupBy(applications.opportunityId).as("apps");
  return db
    .select({ o: opportunities, applicants: sql<number>`coalesce(${apps.n}, 0)::int` })
    .from(opportunities)
    .leftJoin(apps, eq(apps.opportunityId, opportunities.id))
    .where(eq(opportunities.orgId, orgId))
    .orderBy(desc(opportunities.updatedAt));
}

async function orgOpportunity(db: Db, orgId: string, opportunityId: string) {
  if (!z.string().uuid().safeParse(opportunityId).success) throw new EmployerError("NOT_FOUND", "Listing not found");
  const [o] = await db.select().from(opportunities).where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
  if (!o) throw new EmployerError("NOT_FOUND", "Listing not found");
  return o;
}

export async function getOrgOpportunity(db: Db, identityId: string, orgId: string, opportunityId: string) {
  await requireOrg(db, identityId, orgId, "opportunity.view");
  return orgOpportunity(db, orgId, opportunityId);
}

/** Employers write in their own organization's name; the name field from the form is ignored. */
export async function employerCreateOpportunity(db: Db, identityId: string, orgId: string, input: OpportunityInput) {
  const ctx = await requireOrg(db, identityId, orgId, "opportunity.draft");
  return createOpportunity(db, { ...input, organizationName: ctx.org.name }, identityId, { role: "employer", orgId, orgVerified: ctx.org.verificationStatus === "verified" });
}

export async function employerUpdateOpportunity(db: Db, identityId: string, orgId: string, opportunityId: string, input: OpportunityInput) {
  const ctx = await requireOrg(db, identityId, orgId, "opportunity.draft");
  const o = await orgOpportunity(db, orgId, opportunityId);
  // Only drafts are edited directly. Live content changes go through a draft and Avsar review again.
  if (o.status !== "draft") throw new EmployerError("CONFLICT", "Only drafts can be edited. Withdraw it from review or ask Avsar to reopen it.");
  return updateOpportunity(db, opportunityId, { ...input, organizationName: ctx.org.name }, identityId, { role: "employer", orgId });
}

export async function employerTransition(db: Db, identityId: string, orgId: string, opportunityId: string, to: OpportunityStatus, reason?: string) {
  const ctx = await requireOrg(db, identityId, orgId, "opportunity.view");
  const o = await orgOpportunity(db, orgId, opportunityId);
  if (!employerListingTransition(o.status, to)) throw new EmployerError("FORBIDDEN", "Approval and publishing are done by Avsar.");
  const permission: OrgPermission = to === "in_review" ? "opportunity.submit" : to === "draft" ? "opportunity.draft" : "opportunity.pause_close";
  if (!ctx.can(permission)) throw new EmployerError("FORBIDDEN", "Your role or your organization's verification status doesn't allow this.");
  try {
    return await transitionOpportunity(db, opportunityId, to, identityId, reason, { role: "employer", orgId });
  } catch (err) {
    if (err instanceof TransitionError) throw new EmployerError("INVALID", [err.message, ...err.problems].join(" · "));
    throw err;
  }
}

// ─── Applicants ────────────────────────────────────────────────────────────
export const applicantFilter = z.object({
  opportunityId: z.string().uuid().optional().catch(undefined),
  status: z.enum(["submitted", "viewed", "under_review", "shortlisted", "assessment", "interview", "offered", "selected", "rejected", "withdrawn", "closed"]).optional().catch(undefined),
  q: z.string().trim().max(80).optional().catch(undefined),
});

export async function listApplicants(db: Db, identityId: string, orgId: string, filter: z.infer<typeof applicantFilter> = {}) {
  await requireOrg(db, identityId, orgId, "applicant.view");
  const conds = [eq(opportunities.orgId, orgId)];
  if (filter.opportunityId) conds.push(eq(applications.opportunityId, filter.opportunityId));
  if (filter.status) conds.push(eq(applications.status, filter.status));
  if (filter.q) {
    const like = `%${filter.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(sql`(${applications.profileSnapshot}->>'fullName' ilike ${like} or ${applications.profileSnapshot}->>'headline' ilike ${like})`);
  }
  return db
    .select({ a: applications, opportunity: { id: opportunities.id, title: opportunities.title } })
    .from(applications)
    .innerJoin(opportunities, eq(applications.opportunityId, opportunities.id))
    .where(and(...conds))
    .orderBy(desc(applications.submittedAt))
    .limit(200);
}

async function orgApplication(db: Db, orgId: string, applicationId: string) {
  if (!z.string().uuid().safeParse(applicationId).success) throw new EmployerError("NOT_FOUND", "Application not found");
  const [row] = await db
    .select({ a: applications, o: opportunities })
    .from(applications)
    .innerJoin(opportunities, eq(applications.opportunityId, opportunities.id))
    .where(and(eq(applications.id, applicationId), eq(opportunities.orgId, orgId)));
  if (!row) throw new EmployerError("NOT_FOUND", "Application not found");
  return row;
}

/**
 * One application as the organization may see it: the submitted snapshot (not the live profile), answers,
 * history, and, by permission, internal notes and a short-lived resume link. The candidate's email and
 * any data they didn't submit are never included.
 */
export async function getApplicant(db: Db, identityId: string, orgId: string, applicationId: string) {
  const ctx = await requireOrg(db, identityId, orgId, "applicant.view");
  const { a, o } = await orgApplication(db, orgId, applicationId);
  const [answers, events, notes, ivs, tests, thread] = await Promise.all([
    db.select().from(applicationAnswers).where(eq(applicationAnswers.applicationId, a.id)),
    db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, a.id)).orderBy(applicationEvents.at),
    ctx.can("note.read")
      ? db.select({ n: internalNotes, author: userIdentities.name }).from(internalNotes).innerJoin(userIdentities, eq(internalNotes.authorIdentityId, userIdentities.id)).where(eq(internalNotes.applicationId, a.id)).orderBy(internalNotes.createdAt)
      : Promise.resolve(null),
    db.select().from(interviews).where(eq(interviews.applicationId, a.id)).orderBy(interviews.scheduledAt),
    db.select().from(assessments).where(eq(assessments.applicationId, a.id)).orderBy(assessments.createdAt),
    db.select({ m: messages, sender: userIdentities.name }).from(messages).innerJoin(userIdentities, eq(messages.senderIdentityId, userIdentities.id)).where(eq(messages.applicationId, a.id)).orderBy(messages.createdAt),
  ]);
  const [candidate] = await db.select({ identityId: candidateProfiles.identityId }).from(candidateProfiles).where(eq(candidateProfiles.id, a.profileId));
  const resumeUrl = a.resumeDocumentId && ctx.can("applicant.document") ? signedDocumentUrl(a.resumeDocumentId, identityId) : null;
  return {
    ctx, application: a, opportunity: o, answers, events, notes, interviews: ivs, assessments: tests, resumeUrl,
    messages: thread.map((t) => ({ ...t.m, sender: t.sender, fromCandidate: t.m.senderIdentityId === candidate?.identityId })),
  };
}

async function notifyCandidate(db: Db, profileId: string, n: { dedupeKey: string; title: string; body?: string; link: string }) {
  const [p] = await db.select({ identityId: candidateProfiles.identityId }).from(candidateProfiles).where(eq(candidateProfiles.id, profileId));
  if (p) await notify(db, { identityId: p.identityId, kind: "application_status", ...n }).catch(() => undefined);
}

/** Opening a newly submitted application marks it Viewed, so the candidate sees progress. */
export async function markViewed(db: Db, identityId: string, orgId: string, applicationId: string) {
  const ctx = await requireOrg(db, identityId, orgId, "applicant.view");
  const { a } = await orgApplication(db, orgId, applicationId);
  if (a.status !== "submitted" || !ctx.can("applicant.update_status")) return;
  await changeApplicationStatus(db, a.id, "viewed", { id: identityId, role: "employer" });
  await notifyCandidate(db, a.profileId, { dedupeKey: `application_status:${a.id}:viewed`, title: "Your application was viewed", link: `/app/applications/${a.id}` });
}

export async function employerUpdateStatus(db: Db, identityId: string, orgId: string, applicationId: string, to: ApplicationStatus, reason?: string) {
  await requireOrg(db, identityId, orgId, "applicant.update_status");
  const { a, o } = await orgApplication(db, orgId, applicationId);
  try {
    await changeApplicationStatus(db, a.id, to, { id: identityId, role: "employer" }, reason);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("INVALID_TRANSITION")) throw new EmployerError("INVALID", "That status change isn't allowed from the current status.");
    throw err;
  }
  await notifyCandidate(db, a.profileId, { dedupeKey: `application_status:${a.id}:${to}`, title: `Application update: ${APPLICATION_STATUS_LABEL[to]}`, body: o.title, link: `/app/applications/${a.id}` });
}

const text = (max: number, msg = "This can't be empty") => z.string().trim().min(1, msg).max(max);

export async function addNote(db: Db, identityId: string, orgId: string, applicationId: string, body: unknown) {
  await requireOrg(db, identityId, orgId, "note.write");
  const { a } = await orgApplication(db, orgId, applicationId);
  const [n] = await db.insert(internalNotes).values({ applicationId: a.id, authorIdentityId: identityId, body: text(4000).parse(body) }).returning();
  await audit(db, { actorId: identityId, actorRole: "employer", action: "application.note", targetType: "application", targetId: a.id });
  return n;
}

export const interviewInput = z.object({
  scheduledAt: z.preprocess((v) => (v ? new Date(String(v)) : undefined), z.date({ message: "Choose a date and time" })),
  durationMinutes: z.coerce.number().int().min(10).max(480).default(45),
  mode: z.enum(["video", "phone", "onsite"]),
  location: z.string().trim().max(300).optional(),
  interviewers: z.string().trim().max(300).optional(),
});

export async function scheduleInterview(db: Db, identityId: string, orgId: string, applicationId: string, input: z.infer<typeof interviewInput>, now = new Date()) {
  await requireOrg(db, identityId, orgId, "interview.manage");
  const { a, o } = await orgApplication(db, orgId, applicationId);
  if (["rejected", "withdrawn", "closed", "selected"].includes(a.status)) throw new EmployerError("CONFLICT", "This application is closed.");
  if (input.scheduledAt.getTime() <= now.getTime()) throw new EmployerError("INVALID", "Choose a time in the future.");
  const [iv] = await db.insert(interviews).values({ applicationId: a.id, scheduledAt: input.scheduledAt, durationMinutes: input.durationMinutes, mode: input.mode, location: blank(input.location), interviewers: blank(input.interviewers), createdBy: identityId }).returning();
  if (["submitted", "viewed", "under_review", "shortlisted", "assessment"].includes(a.status)) await changeApplicationStatus(db, a.id, "interview", { id: identityId, role: "employer" }, "Interview scheduled");
  await notifyCandidate(db, a.profileId, { dedupeKey: `interview:${iv.id}`, title: `Interview scheduled: ${o.title}`, body: input.scheduledAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }), link: `/app/applications/${a.id}` });
  await audit(db, { actorId: identityId, actorRole: "employer", action: "interview.schedule", targetType: "application", targetId: a.id });
  return iv;
}

export const interviewFeedback = z.object({
  status: z.enum(["completed", "cancelled"]),
  outcome: z.enum(["advance", "hold", "decline"]).optional(),
  feedback: z.string().trim().max(4000).optional(),
});

/** Feedback records a person's recommendation. It never changes the application status by itself. */
export async function recordInterviewFeedback(db: Db, identityId: string, orgId: string, interviewId: string, input: z.infer<typeof interviewFeedback>) {
  await requireOrg(db, identityId, orgId, "interview.manage");
  if (!z.string().uuid().safeParse(interviewId).success) throw new EmployerError("NOT_FOUND", "Interview not found");
  const [row] = await db.select({ iv: interviews, orgId: opportunities.orgId }).from(interviews).innerJoin(applications, eq(interviews.applicationId, applications.id)).innerJoin(opportunities, eq(applications.opportunityId, opportunities.id)).where(eq(interviews.id, interviewId));
  if (!row || row.orgId !== orgId) throw new EmployerError("NOT_FOUND", "Interview not found");
  await db.update(interviews).set({ status: input.status, outcome: input.outcome ?? null, feedback: blank(input.feedback) }).where(eq(interviews.id, interviewId));
  await audit(db, { actorId: identityId, actorRole: "employer", action: "interview.feedback", targetType: "application", targetId: row.iv.applicationId });
}

export const assessmentInput = z.object({
  title: text(160, "Name the assessment"),
  instructions: z.string().trim().max(4000).optional(),
  dueAt: z.preprocess((v) => (v ? new Date(String(v)) : undefined), z.date().optional()),
  maxScore: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

export async function createAssessment(db: Db, identityId: string, orgId: string, applicationId: string, input: z.infer<typeof assessmentInput>) {
  await requireOrg(db, identityId, orgId, "assessment.manage");
  const { a, o } = await orgApplication(db, orgId, applicationId);
  if (["rejected", "withdrawn", "closed", "selected"].includes(a.status)) throw new EmployerError("CONFLICT", "This application is closed.");
  const [as] = await db.insert(assessments).values({ applicationId: a.id, title: input.title, instructions: blank(input.instructions), dueAt: input.dueAt ?? null, maxScore: input.maxScore ?? null, createdBy: identityId }).returning();
  if (["submitted", "viewed", "under_review", "shortlisted"].includes(a.status)) await changeApplicationStatus(db, a.id, "assessment", { id: identityId, role: "employer" }, "Assessment assigned");
  await notifyCandidate(db, a.profileId, { dedupeKey: `assessment:${as.id}`, title: `Assessment: ${input.title}`, body: o.title, link: `/app/applications/${a.id}` });
  await audit(db, { actorId: identityId, actorRole: "employer", action: "assessment.create", targetType: "application", targetId: a.id });
  return as;
}

export const assessmentResult = z.object({
  score: z.coerce.number().int().min(0).max(1000).optional().catch(undefined),
  result: z.enum(["passed", "not_passed", "incomplete"]),
  feedback: z.string().trim().max(4000).optional(),
});

export async function recordAssessmentResult(db: Db, identityId: string, orgId: string, assessmentId: string, input: z.infer<typeof assessmentResult>) {
  await requireOrg(db, identityId, orgId, "assessment.manage");
  if (!z.string().uuid().safeParse(assessmentId).success) throw new EmployerError("NOT_FOUND", "Assessment not found");
  const [row] = await db.select({ as: assessments, orgId: opportunities.orgId }).from(assessments).innerJoin(applications, eq(assessments.applicationId, applications.id)).innerJoin(opportunities, eq(applications.opportunityId, opportunities.id)).where(eq(assessments.id, assessmentId));
  if (!row || row.orgId !== orgId) throw new EmployerError("NOT_FOUND", "Assessment not found");
  if (input.score !== undefined && row.as.maxScore !== null && input.score > row.as.maxScore) throw new EmployerError("INVALID", `Score can't exceed ${row.as.maxScore}.`);
  await db.update(assessments).set({ score: input.score ?? null, result: input.result, feedback: blank(input.feedback) }).where(eq(assessments.id, assessmentId));
  await audit(db, { actorId: identityId, actorRole: "employer", action: "assessment.result", targetType: "application", targetId: row.as.applicationId });
}

export async function sendEmployerMessage(db: Db, identityId: string, orgId: string, applicationId: string, body: unknown) {
  await requireOrg(db, identityId, orgId, "message.send");
  const { a, o } = await orgApplication(db, orgId, applicationId);
  const [m] = await db.insert(messages).values({ applicationId: a.id, senderIdentityId: identityId, body: text(4000).parse(body) }).returning();
  await notifyCandidate(db, a.profileId, { dedupeKey: `message:${m.id}`, title: `Message from ${o.organizationName}`, body: o.title, link: `/app/applications/${a.id}` });
  await audit(db, { actorId: identityId, actorRole: "employer", action: "application.message", targetType: "application", targetId: a.id });
  return m;
}

/** Candidate side of the thread: only on their own application, and only once the organization has written. */
export async function sendCandidateMessage(db: Db, identityId: string, profileId: string, applicationId: string, body: unknown) {
  if (!z.string().uuid().safeParse(applicationId).success) throw new EmployerError("NOT_FOUND", "Application not found");
  const [a] = await db.select().from(applications).where(and(eq(applications.id, applicationId), eq(applications.profileId, profileId)));
  if (!a) throw new EmployerError("NOT_FOUND", "Application not found");
  const [first] = await db.select({ id: messages.id }).from(messages).where(eq(messages.applicationId, a.id)).limit(1);
  if (!first) throw new EmployerError("FORBIDDEN", "You can reply once the organization has written to you.");
  return (await db.insert(messages).values({ applicationId: a.id, senderIdentityId: identityId, body: text(4000).parse(body) }).returning())[0];
}

export async function candidateThread(db: Db, profileId: string, applicationId: string) {
  const [a] = await db.select({ id: applications.id }).from(applications).where(and(eq(applications.id, applicationId), eq(applications.profileId, profileId)));
  if (!a) return [];
  const [p] = await db.select({ identityId: candidateProfiles.identityId }).from(candidateProfiles).where(eq(candidateProfiles.id, profileId));
  const rows = await db.select().from(messages).where(eq(messages.applicationId, a.id)).orderBy(messages.createdAt);
  // The candidate sees the organization as one sender; individual recruiters' identities aren't exposed.
  return rows.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt, fromCandidate: m.senderIdentityId === p?.identityId }));
}

// ─── Analytics ─────────────────────────────────────────────────────────────
/** Metric definitions shown next to every number. Sample listings are excluded. */
export const METRIC_DEFINITIONS = {
  views: "Distinct signed-in people who opened the listing. Signed-out visits aren't counted.",
  saves: "People who currently have the listing saved.",
  applications: "Applications submitted on Avsar (external-site applications can't be counted).",
  reviewed: "Applications that reached Viewed or any later stage.",
  shortlisted: "Applications that reached Shortlisted or any later stage (assessment, interview, offer, selected).",
  interviewed: "Applications that reached Interview or any later stage.",
  offered: "Applications that reached Offered or Selected.",
  conversion: "Applications ÷ views. Shown only when there are at least 10 views.",
} as const;

const AT_LEAST: Record<"reviewed" | "shortlisted" | "interviewed" | "offered", ApplicationStatus[]> = {
  reviewed: ["viewed", "under_review", "shortlisted", "assessment", "interview", "offered", "selected"],
  shortlisted: ["shortlisted", "assessment", "interview", "offered", "selected"],
  interviewed: ["interview", "offered", "selected"],
  offered: ["offered", "selected"],
};

/**
 * Funnel stages count applications whose status has EVER reached the stage (from status history), so a
 * later rejection doesn't erase the fact that a candidate was interviewed.
 */
export async function orgAnalytics(db: Db, identityId: string, orgId: string) {
  await requireOrg(db, identityId, orgId, "analytics.view");
  const listings = await db.select({ id: opportunities.id, title: opportunities.title, status: opportunities.status }).from(opportunities).where(and(eq(opportunities.orgId, orgId), eq(opportunities.isSample, false)));
  const ids = listings.map((l) => l.id);
  if (!ids.length) return { listings: [], totals: { views: 0, saves: 0, applications: 0, reviewed: 0, shortlisted: 0, interviewed: 0, offered: 0 } };
  const [views, saves, apps, reached] = await Promise.all([
    db.select({ id: recentlyViewed.opportunityId, n: countDistinct(recentlyViewed.identityId) }).from(recentlyViewed).where(inArray(recentlyViewed.opportunityId, ids)).groupBy(recentlyViewed.opportunityId),
    db.select({ id: savedOpportunities.opportunityId, n: count() }).from(savedOpportunities).where(inArray(savedOpportunities.opportunityId, ids)).groupBy(savedOpportunities.opportunityId),
    db.select({ id: applications.opportunityId, n: count() }).from(applications).where(inArray(applications.opportunityId, ids)).groupBy(applications.opportunityId),
    db.selectDistinct({ id: applications.opportunityId, app: applications.id, status: applicationEvents.toStatus }).from(applicationEvents).innerJoin(applications, eq(applicationEvents.applicationId, applications.id)).where(inArray(applications.opportunityId, ids)),
  ]);
  const by = (rows: { id: string; n: number }[]) => new Map(rows.map((r) => [r.id, Number(r.n)]));
  const v = by(views), s = by(saves), ap = by(apps);
  const stage = (oppId: string, k: keyof typeof AT_LEAST) => new Set(reached.filter((r) => r.id === oppId && AT_LEAST[k].includes(r.status)).map((r) => r.app)).size;
  const rows = listings.map((l) => ({
    ...l,
    views: v.get(l.id) ?? 0, saves: s.get(l.id) ?? 0, applications: ap.get(l.id) ?? 0,
    reviewed: stage(l.id, "reviewed"), shortlisted: stage(l.id, "shortlisted"), interviewed: stage(l.id, "interviewed"), offered: stage(l.id, "offered"),
  }));
  const sum = (k: keyof (typeof rows)[number]) => rows.reduce((t, r) => t + (r[k] as number), 0);
  return { listings: rows, totals: { views: sum("views"), saves: sum("saves"), applications: sum("applications"), reviewed: sum("reviewed"), shortlisted: sum("shortlisted"), interviewed: sum("interviewed"), offered: sum("offered") } };
}

/** For the private document route: may this person open this document because their organization received it? */
export async function employerMayViewDocument(db: Db, identityId: string, documentId: string): Promise<boolean> {
  const rows = await db
    .select({ role: organizationMembers.role, verification: organizations.verificationStatus })
    .from(applications)
    .innerJoin(opportunities, eq(applications.opportunityId, opportunities.id))
    .innerJoin(organizationMembers, and(eq(organizationMembers.orgId, opportunities.orgId), eq(organizationMembers.identityId, identityId)))
    .innerJoin(organizations, eq(organizations.id, opportunities.orgId))
    .innerJoin(documents, and(eq(documents.id, applications.resumeDocumentId), isNull(documents.deletedAt)))
    .where(eq(applications.resumeDocumentId, documentId));
  return rows.some((r) => orgCan(r.role, "applicant.document", r.verification as OrgVerification));
}

/** What the candidate sees about recruitment steps: schedule and instructions only, never internal feedback, scores or notes. */
export async function candidateRecruitmentView(db: Db, profileId: string, applicationId: string) {
  if (!z.string().uuid().safeParse(applicationId).success) return null;
  const [a] = await db.select({ id: applications.id }).from(applications).where(and(eq(applications.id, applicationId), eq(applications.profileId, profileId)));
  if (!a) return null;
  const [ivs, tests, thread] = await Promise.all([
    db.select({ id: interviews.id, scheduledAt: interviews.scheduledAt, durationMinutes: interviews.durationMinutes, mode: interviews.mode, location: interviews.location, status: interviews.status }).from(interviews).where(eq(interviews.applicationId, a.id)).orderBy(interviews.scheduledAt),
    db.select({ id: assessments.id, title: assessments.title, instructions: assessments.instructions, dueAt: assessments.dueAt }).from(assessments).where(eq(assessments.applicationId, a.id)).orderBy(assessments.createdAt),
    candidateThread(db, profileId, a.id),
  ]);
  return { interviews: ivs, assessments: tests, messages: thread };
}