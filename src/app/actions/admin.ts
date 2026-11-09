"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { audit } from "@/server/audit";
import { ForbiddenError, requirePermission } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { adminRoles, jobs, opportunitySources, organizations, supportTickets, userIdentities, verificationRequests } from "@/server/db/schema";
import type { AdminRole, Permission } from "@/server/domain/permissions";
import type { ApplicationStatus, OpportunityStatus } from "@/server/domain/workflows";
import { changeApplicationStatus } from "@/server/services/applications";
import { notify } from "@/server/services/notifications";
import { createOpportunity, importBatch, opportunityInput, transitionOpportunity, TransitionError, updateOpportunity, type OpportunityInput } from "@/server/services/opportunities";
import { parseCategoryDetails } from "@/server/domain/categories";
import { MODERATION_ACTIONS, resolveCase } from "@/server/services/trust";

import type { ActionState } from "./candidate";

/** Every admin action re-checks its specific permission on the server. */
async function guard(p: Permission) {
  try {
    return await requirePermission(p);
  } catch (err) {
    if (err instanceof ForbiddenError) return null;
    throw err;
  }
}
const denied: ActionState = { ok: false, message: "You don't have permission to do that." };

/**
 * Form → validated opportunity input, including the category's own fields (`d_*`). Shared with Employer
 * Studio. Errors are keyed by field name so they show next to the right input.
 */
export async function validateOpportunityForm(fd: FormData): Promise<{ ok: true; data: OpportunityInput } | { ok: false; errors: Record<string, string> }> {
  const parsed = opportunityInput.safeParse(opportunityForm(fd));
  const errors: Record<string, string> = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
  const det = parseCategoryDetails(String(fd.get("category") ?? ""), (k) => (fd.get(k) === null ? null : String(fd.get(k))));
  if (!det.ok) Object.assign(errors, det.errors);
  if (!parsed.success || !det.ok) return { ok: false, errors };
  return { ok: true, data: { ...parsed.data, details: det.details } };
}

function opportunityForm(fd: FormData) {
  const get = (k: string) => (fd.get(k) === null ? undefined : String(fd.get(k)));
  return {
    title: get("title"), category: get("category"), employmentType: get("employmentType") || undefined, organizationName: get("organizationName"),
    summary: get("summary") || undefined, description: get("description"), responsibilities: get("responsibilities") || undefined,
    workMode: get("workMode"), locations: get("locations") ?? "", compMin: get("compMin"), compMax: get("compMax"),
    compPeriod: get("compPeriod") || undefined, unpaid: fd.get("unpaid") === "on", durationWeeks: get("durationWeeks"),
    experienceMinYears: get("experienceMinYears"), deadline: get("deadline") || undefined, applicationMethod: get("applicationMethod"),
    externalUrl: get("externalUrl") || undefined, requiredSkills: get("requiredSkills") ?? "", preferredSkills: get("preferredSkills") ?? "",
    educationLevels: fd.getAll("educationLevels").map(String), graduationYearMin: get("graduationYearMin"), graduationYearMax: get("graduationYearMax"),
    requiresWorkAuthorizationIndia: fd.get("requiresWorkAuthorizationIndia") === "on", sourceUrl: get("sourceUrl") || undefined,
    stipendNote: get("stipendNote") || undefined, conversionPossible: fd.get("conversionPossible") === "on", deliverables: get("deliverables") || undefined,
  };
}

export async function saveOpportunityAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await guard("opportunity.create");
  if (!s) return denied;
  const parsed = await validateOpportunityForm(fd);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, message: "Please fix the highlighted fields." };
  const db = await getDb();
  const row = id ? await updateOpportunity(db, z.string().uuid().parse(id), parsed.data, s.identity.id) : await createOpportunity(db, parsed.data, s.identity.id);
  revalidatePath("/admin", "layout");
  redirect(`/admin/opportunities/${row.id}?saved=1`);
}

const TRANSITION_PERMISSION: Partial<Record<OpportunityStatus, Permission>> = {
  in_review: "opportunity.create",
  approved: "opportunity.review",
  rejected: "opportunity.review",
  draft: "opportunity.create",
  published: "opportunity.publish",
  paused: "opportunity.publish",
  closed: "opportunity.publish",
  suspended: "opportunity.suspend",
};

export async function transitionAction(id: string, to: OpportunityStatus, _: ActionState, fd: FormData): Promise<ActionState> {
  const perm = TRANSITION_PERMISSION[to];
  const s = perm ? await guard(perm) : null;
  if (!s) return denied;
  try {
    await transitionOpportunity(await getDb(), z.string().uuid().parse(id), to, s.identity.id, String(fd.get("reason") ?? "") || undefined);
  } catch (err) {
    if (err instanceof TransitionError) return { ok: false, message: [err.message, ...err.problems].join(" · ") };
    throw err;
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/opportunities");
  // The form that triggered this disappears once the status changes, so confirm on the page itself.
  redirect(`/admin/opportunities/${id}?moved=${to}`);
}

export async function importAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await guard("import.review");
  if (!s) return denied;
  const sourceId = z.string().uuid().safeParse(fd.get("sourceId"));
  if (!sourceId.success) return { ok: false, errors: { sourceId: "Choose an approved source." } };
  let items: unknown;
  try {
    items = JSON.parse(String(fd.get("payload") ?? ""));
  } catch {
    return { ok: false, errors: { payload: "Paste a JSON array of items." } };
  }
  if (!Array.isArray(items) || items.length === 0) return { ok: false, errors: { payload: "Paste a JSON array with at least one item." } };
  if (items.length > 500) return { ok: false, errors: { payload: "Import at most 500 items at a time." } };
  try {
    const r = await importBatch(await getDb(), sourceId.data, items, s.identity.id);
    revalidatePath("/admin", "layout");
    return { ok: true, message: `${r.queued} queued for review · ${r.duplicate} duplicates · ${r.invalid} invalid. Nothing was published automatically.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error && err.message === "SOURCE_NOT_ACTIVE" ? "That source is inactive." : "Import failed." };
  }
}

export async function addSourceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await guard("source.manage");
  if (!s) return denied;
  const parsed = z.object({ name: z.string().trim().min(2).max(100), kind: z.enum(["manual", "feed", "api"]), url: z.string().trim().max(300).optional(), termsNote: z.string().trim().min(10, "Record how we're allowed to use this source").max(1000) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const db = await getDb();
  const [src] = await db.insert(opportunitySources).values({ ...parsed.data, url: parsed.data.url || null }).returning();
  await audit(db, { actorId: s.identity.id, actorRole: "admin", action: "source.create", targetType: "source", targetId: src.id });
  revalidatePath("/admin/sources");
  return { ok: true, message: "Source added." };
}

export async function toggleSourceAction(id: string, active: boolean) {
  const s = await guard("source.manage");
  if (!s) return;
  const db = await getDb();
  await db.update(opportunitySources).set({ active }).where(eq(opportunitySources.id, z.string().uuid().parse(id)));
  await audit(db, { actorId: s.identity.id, actorRole: "admin", action: active ? "source.activate" : "source.deactivate", targetType: "source", targetId: id });
  revalidatePath("/admin/sources");
}

export async function resolveCaseAction(caseId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await guard("report.moderate");
  if (!s) return denied;
  const action = z.enum(MODERATION_ACTIONS).safeParse(fd.get("action"));
  const note = String(fd.get("note") ?? "").trim();
  if (!action.success) return { ok: false, errors: { action: "Choose an action." } };
  if (note.length < 5) return { ok: false, errors: { note: "Record the reason for this decision." } };
  try {
    await resolveCase(await getDb(), z.string().uuid().parse(caseId), action.data, note, s.identity.id);
  } catch (err) {
    return { ok: false, message: err instanceof Error && err.message === "ALREADY_RESOLVED" ? "This case was already resolved." : "Couldn't resolve the case." };
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/moderation?resolved=${action.data}`); // the resolved case leaves the open list, so confirm at page level
}

export async function applicationStatusAction(applicationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await guard("application.update_status");
  if (!s) return denied;
  const to = String(fd.get("status")) as ApplicationStatus;
  const db = await getDb();
  try {
    const app = await changeApplicationStatus(db, z.string().uuid().parse(applicationId), to, { id: s.identity.id, role: "admin" }, String(fd.get("reason") ?? "") || undefined);
    const { candidateProfiles } = await import("@/server/db/schema");
    const [p] = await db.select({ identityId: candidateProfiles.identityId }).from(candidateProfiles).where(eq(candidateProfiles.id, app.profileId));
    if (p) {
      const { APPLICATION_STATUS_LABEL } = await import("@/server/domain/workflows");
      await notify(db, { identityId: p.identityId, kind: "application_status", dedupeKey: `application_status:${app.id}:${to}`, title: `Application update: ${APPLICATION_STATUS_LABEL[to]}`, link: `/app/applications/${app.id}` }).catch(() => undefined);
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error && err.message.startsWith("INVALID_TRANSITION") ? "That status change isn't allowed from the current status." : "Couldn't update the application." };
  }
  revalidatePath("/admin/applications");
  return { ok: true, message: "Status updated and the candidate notified." };
}

export async function verificationDecisionAction(requestId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await guard("organization.verify");
  if (!s) return denied;
  const decision = z.enum(["verified", "rejected", "under_review"]).safeParse(fd.get("decision"));
  const note = String(fd.get("note") ?? "").trim();
  if (!decision.success || note.length < 5) return { ok: false, message: "Choose a decision and record the evidence you relied on." };
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [req] = await tx.update(verificationRequests).set({ status: decision.data, reviewedBy: s.identity.id, decisionNote: note, decidedAt: decision.data === "under_review" ? null : new Date() }).where(eq(verificationRequests.id, z.string().uuid().parse(requestId))).returning();
    if (req) await tx.update(organizations).set({ verificationStatus: decision.data, verifiedAt: decision.data === "verified" ? new Date() : null, updatedAt: new Date() }).where(eq(organizations.id, req.orgId));
    await audit(tx, { actorId: s.identity.id, actorRole: "verification_officer", action: `verification.${decision.data}`, targetType: "verification_request", targetId: requestId });
  });
  revalidatePath("/admin/verification");
  return { ok: true, message: "Decision recorded." };
}

export async function ticketStatusAction(id: string, status: "open" | "pending" | "closed") {
  const s = await guard("support.handle");
  if (!s) return;
  const db = await getDb();
  await db.update(supportTickets).set({ status }).where(eq(supportTickets.id, z.string().uuid().parse(id)));
  await audit(db, { actorId: s.identity.id, actorRole: "support_agent", action: `support.${status}`, targetType: "support_ticket", targetId: id });
  revalidatePath("/admin/support");
}

export async function retryJobAction(id: string) {
  const s = await guard("source.manage"); // platform operations, not read-only analytics
  if (!s) return;
  const db = await getDb();
  await db.update(jobs).set({ status: "queued", attempts: 0, runAt: new Date(), lastError: null }).where(eq(jobs.id, z.string().uuid().parse(id)));
  await audit(db, { actorId: s.identity.id, actorRole: "admin", action: "job.retry", targetType: "job", targetId: id });
  revalidatePath("/admin/health");
}

export async function grantRoleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await guard("role.grant");
  if (!s) return denied;
  const parsed = z.object({ identityId: z.string().uuid(), role: z.enum(["super_admin", "platform_admin", "verification_officer", "moderator", "support_agent", "analytics_admin"]) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: "Choose a person and a role." };
  const db = await getDb();
  const [who] = await db.select({ id: userIdentities.id }).from(userIdentities).where(eq(userIdentities.id, parsed.data.identityId));
  if (!who) return { ok: false, message: "No such account." };
  await db.insert(adminRoles).values({ identityId: who.id, role: parsed.data.role as AdminRole, grantedBy: s.identity.id }).onConflictDoNothing();
  await audit(db, { actorId: s.identity.id, actorRole: "super_admin", action: "role.grant", targetType: "identity", targetId: who.id, metadata: { role: parsed.data.role } });
  revalidatePath("/admin/configuration");
  return { ok: true, message: "Role granted." };
}
