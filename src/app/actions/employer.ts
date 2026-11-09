"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCandidate, requireUser } from "@/server/auth/session";
import { features } from "@/server/config";
import { getDb } from "@/server/db/client";
import type { ApplicationStatus, OpportunityStatus } from "@/server/domain/workflows";
import * as emp from "@/server/services/employer";

import { validateOpportunityForm } from "./admin";
import type { ActionState } from "./candidate";
import { rateLimit, TOO_MANY } from "@/server/rate-limit";

const limited = async (name: "message" | "invite", id: string) => !(await rateLimit(await getDb(), name, `id:${id}`)).ok;

/**
 * Employer Studio actions. Authorization lives in the employer service (membership + role + verification,
 * per organization); these actions only parse input and translate errors.
 */
async function me() {
  if (!features.employerStudio()) throw new Error("Employer Studio is not enabled");
  return requireUser("/studio");
}
const errs = (e: z.ZodError) => Object.fromEntries(e.issues.map((i) => [String(i.path[0] ?? "form"), i.message]));
const fail = (err: unknown): ActionState => {
  if (err instanceof emp.EmployerError) return { ok: false, message: err.message };
  if (err instanceof z.ZodError) return { ok: false, errors: errs(err), message: err.issues[0]?.message };
  throw err; // includes Next's redirect signal
};
const obj = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
const base = (orgId: string) => `/studio/${orgId}`;

export async function createOrgAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  const parsed = emp.orgInput.safeParse(obj(fd));
  if (!parsed.success) return { ok: false, errors: errs(parsed.error) };
  const org = await emp.createOrganization(await getDb(), s.identity.id, parsed.data);
  redirect(`${base(org.id)}/settings?created=1`);
}

export async function updateOrgAction(orgId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  const parsed = emp.orgInput.safeParse(obj(fd));
  if (!parsed.success) return { ok: false, errors: errs(parsed.error) };
  try {
    const { reverify } = await emp.updateOrganization(await getDb(), s.identity.id, orgId, parsed.data);
    revalidatePath(base(orgId), "layout");
    return { ok: true, message: reverify ? "Saved. Because the name or domain changed, verification must be requested again." : "Organization profile saved." };
  } catch (e) { return fail(e); }
}

export async function requestVerificationAction(orgId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  const parsed = emp.verificationInput.safeParse(obj(fd));
  if (!parsed.success) return { ok: false, errors: errs(parsed.error) };
  try {
    await emp.requestVerification(await getDb(), s.identity.id, orgId, parsed.data);
  } catch (e) { return fail(e); }
  revalidatePath(base(orgId), "layout");
  // The form disappears once a request is pending, so confirm on the page itself.
  redirect(`${base(orgId)}/settings?verification=requested#verification`);
}

export async function inviteAction(orgId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  try {
    if (await limited("invite", s.identity.id)) return { ok: false, message: TOO_MANY };
    const { link } = await emp.inviteMember(await getDb(), s.identity.id, orgId, { email: fd.get("email"), role: fd.get("role") });
    revalidatePath(`${base(orgId)}/settings`);
    return { ok: true, message: `Invitation created and emailed. You can also share this one-time link directly: ${link}` };
  } catch (e) { return fail(e); }
}

export async function revokeInviteAction(orgId: string, invitationId: string) {
  const s = await me();
  await emp.revokeInvitation(await getDb(), s.identity.id, orgId, invitationId).catch(() => undefined);
  revalidatePath(`${base(orgId)}/settings`);
}

export async function memberRoleAction(orgId: string, memberId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  try {
    await emp.changeMemberRole(await getDb(), s.identity.id, orgId, memberId, fd.get("role"));
    revalidatePath(`${base(orgId)}/settings`);
    return { ok: true, message: "Role updated." };
  } catch (e) { return fail(e); }
}

export async function removeMemberAction(orgId: string, memberId: string): Promise<ActionState> {
  const s = await me();
  try {
    await emp.removeMember(await getDb(), s.identity.id, orgId, memberId);
    revalidatePath(`${base(orgId)}/settings`);
    return { ok: true, message: "Member removed." };
  } catch (e) { return fail(e); }
}

export async function acceptInviteAction(token: string): Promise<ActionState> {
  const s = await me();
  if (await limited("invite", s.identity.id)) return { ok: false, message: TOO_MANY };
  let orgId: string;
  try { orgId = await emp.acceptInvitation(await getDb(), s.identity.id, token); } catch (e) { return fail(e); }
  redirect(`${base(orgId)}?joined=1`);
}

export async function saveListingAction(orgId: string, opportunityId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  const parsed = await validateOpportunityForm(fd);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, message: "Please fix the highlighted fields." };
  const db = await getDb();
  let id: string;
  try {
    id = opportunityId ? (await emp.employerUpdateOpportunity(db, s.identity.id, orgId, opportunityId, parsed.data)).id : (await emp.employerCreateOpportunity(db, s.identity.id, orgId, parsed.data)).id;
  } catch (e) { return fail(e); }
  redirect(`${base(orgId)}/listings/${id}?saved=1`);
}

export async function listingTransitionAction(orgId: string, opportunityId: string, to: OpportunityStatus, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  try {
    await emp.employerTransition(await getDb(), s.identity.id, orgId, opportunityId, to, String(fd.get("reason") ?? "").slice(0, 300) || undefined);
  } catch (e) { return fail(e); }
  revalidatePath(base(orgId), "layout");
  revalidatePath("/opportunities");
  redirect(`${base(orgId)}/listings/${opportunityId}?moved=${to}`);
}

export async function applicantStatusAction(orgId: string, applicationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  try {
    await emp.employerUpdateStatus(await getDb(), s.identity.id, orgId, applicationId, String(fd.get("status")) as ApplicationStatus, String(fd.get("reason") ?? "").slice(0, 300) || undefined);
  } catch (e) { return fail(e); }
  revalidatePath(`${base(orgId)}/applicants`, "layout");
  return { ok: true, message: "Status updated. The candidate has been notified." };
}

export async function noteAction(orgId: string, applicationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  try { await emp.addNote(await getDb(), s.identity.id, orgId, applicationId, fd.get("body")); } catch (e) { return fail(e); }
  revalidatePath(`${base(orgId)}/applicants/${applicationId}`);
  return { ok: true, message: "Note added. Only your organization can see it." };
}

export async function interviewAction(orgId: string, applicationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  const parsed = emp.interviewInput.safeParse(obj(fd));
  if (!parsed.success) return { ok: false, errors: errs(parsed.error) };
  try { await emp.scheduleInterview(await getDb(), s.identity.id, orgId, applicationId, parsed.data); } catch (e) { return fail(e); }
  revalidatePath(`${base(orgId)}/applicants/${applicationId}`);
  return { ok: true, message: "Interview scheduled. The candidate has been notified." };
}

export async function interviewFeedbackAction(orgId: string, applicationId: string, interviewId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  const parsed = emp.interviewFeedback.safeParse({ ...obj(fd), outcome: fd.get("outcome") || undefined });
  if (!parsed.success) return { ok: false, errors: errs(parsed.error) };
  try { await emp.recordInterviewFeedback(await getDb(), s.identity.id, orgId, interviewId, parsed.data); } catch (e) { return fail(e); }
  revalidatePath(`${base(orgId)}/applicants/${applicationId}`);
  return { ok: true, message: "Feedback recorded." };
}

export async function assessmentAction(orgId: string, applicationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  const parsed = emp.assessmentInput.safeParse(obj(fd));
  if (!parsed.success) return { ok: false, errors: errs(parsed.error) };
  try { await emp.createAssessment(await getDb(), s.identity.id, orgId, applicationId, parsed.data); } catch (e) { return fail(e); }
  revalidatePath(`${base(orgId)}/applicants/${applicationId}`);
  return { ok: true, message: "Assessment assigned. The candidate has been notified." };
}

export async function assessmentResultAction(orgId: string, applicationId: string, assessmentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  const parsed = emp.assessmentResult.safeParse(obj(fd));
  if (!parsed.success) return { ok: false, errors: errs(parsed.error) };
  try { await emp.recordAssessmentResult(await getDb(), s.identity.id, orgId, assessmentId, parsed.data); } catch (e) { return fail(e); }
  revalidatePath(`${base(orgId)}/applicants/${applicationId}`);
  return { ok: true, message: "Result recorded." };
}

export async function messageAction(orgId: string, applicationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await me();
  if (await limited("message", s.identity.id)) return { ok: false, message: TOO_MANY };
  try { await emp.sendEmployerMessage(await getDb(), s.identity.id, orgId, applicationId, fd.get("body")); } catch (e) { return fail(e); }
  revalidatePath(`${base(orgId)}/applicants/${applicationId}`);
  return { ok: true, message: "Message sent." };
}

/** Candidate reply on their own application thread. */
export async function candidateReplyAction(applicationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireCandidate(`/app/applications/${applicationId}`);
  if (await limited("message", s.identity.id)) return { ok: false, message: TOO_MANY };
  try { await emp.sendCandidateMessage(await getDb(), s.identity.id, s.profileId, applicationId, fd.get("body")); } catch (e) { return fail(e); }
  revalidatePath(`/app/applications/${applicationId}`);
  return { ok: true, message: "Reply sent." };
}
