import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createMemoryDb, type Db } from "../db/client";
import { auditLogs, documents, organizations } from "../db/schema";
import { upsertIdentity } from "../auth/identity";
import { employerListingTransition, orgCan } from "../domain/org-permissions";
import { submitApplication } from "./applications";
import { readDocumentForViewer, uploadResume } from "./documents";
import {
  acceptInvitation, addNote, changeMemberRole, createOrganization, employerCreateOpportunity, employerMayViewDocument, employerTransition,
  employerUpdateStatus, EmployerError, getApplicant, inviteMember, listApplicants, orgAnalytics, removeMember, requestVerification, scheduleInterview,
} from "./employer";
import { transitionOpportunity, type OpportunityInput } from "./opportunities";
import { ensureProfile, loadProfile } from "./profiles";

let db: Db;
const ids: Record<string, string> = {};
let orgA: string, orgB: string, oppA: string, appA: string, resumeDoc: string;

const listing = (title: string): OpportunityInput => ({
  title, category: "internship", organizationName: "ignored", description: "A real internship description that is long enough to pass validation.", workMode: "remote",
  locations: "", unpaid: false, applicationMethod: "internal", requiredSkills: "React", preferredSkills: "", educationLevels: [], requiresWorkAuthorizationIndia: false, conversionPossible: false,
  deadline: new Date(Date.now() + 20 * 86_400_000),
} as OpportunityInput);

const who = async (k: string) => (ids[k] = (await upsertIdentity(db, { provider: "ai_tathastu", subject: `emp-${k}`, email: null, emailVerified: false, name: k })).id);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

beforeAll(async () => {
  db = await createMemoryDb();
  for (const k of ["ownerA", "ownerB", "invitee", "stranger", "candidate", "admin"]) await who(k);
  orgA = (await createOrganization(db, ids.ownerA, { name: "Alpha Labs", website: "https://alpha.example" })).id;
  orgB = (await createOrganization(db, ids.ownerB, { name: "Beta Works", website: "https://beta.example" })).id;
});

describe("organization permission model", () => {
  it("never lets an organization approve or publish", () => {
    expect(employerListingTransition("draft", "published")).toBe(false);
    expect(employerListingTransition("in_review", "approved")).toBe(false);
    expect(employerListingTransition("approved", "published")).toBe(false);
    expect(employerListingTransition("draft", "in_review")).toBe(true);
  });
  it("requires verification for actions that reach candidates or the public", () => {
    expect(orgCan("owner", "opportunity.draft", "unverified")).toBe(true);
    expect(orgCan("owner", "opportunity.submit", "unverified")).toBe(false);
    expect(orgCan("owner", "opportunity.submit", "verified")).toBe(true);
    expect(orgCan("viewer", "note.read", "verified")).toBe(false);
    expect(orgCan("viewer", "applicant.document", "verified")).toBe(false);
    expect(orgCan("owner", "applicant.update_status", "suspended")).toBe(false);
  });
});

describe("Employer Studio flow and isolation", () => {
  it("unverified organizations can draft but not submit for review", async () => {
    oppA = (await employerCreateOpportunity(db, ids.ownerA, orgA, listing("Frontend Intern (Alpha)"))).id;
    await expect(employerTransition(db, ids.ownerA, orgA, oppA, "in_review")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("verification request → admin verifies → submit → only Avsar publishes", async () => {
    await requestVerification(db, ids.ownerA, orgA, { representative: "A. Owner, Founder" });
    await expect(requestVerification(db, ids.ownerA, orgA, { representative: "again" })).rejects.toMatchObject({ code: "CONFLICT" });
    await db.update(organizations).set({ verificationStatus: "verified" }).where(eq(organizations.id, orgA)); // admin decision (tested in admin flow)
    await employerTransition(db, ids.ownerA, orgA, oppA, "in_review");
    await expect(employerTransition(db, ids.ownerA, orgA, oppA, "published")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await transitionOpportunity(db, oppA, "approved", ids.admin);
    await transitionOpportunity(db, oppA, "published", ids.admin);
  });

  it("organization B can't see or act on organization A's listings or applicants", async () => {
    const pid = (await ensureProfile(db, ids.candidate, "Cand"))!.id;
    const resume = await uploadResume(db, { identityId: ids.candidate, profileId: pid }, { name: "cv.pdf", bytes: PDF }, "CV");
    resumeDoc = resume.documentId;
    const p = (await loadProfile(db, pid))!;
    appA = (await submitApplication(db, p, ids.candidate, { opportunityId: oppA, resumeId: resume.id, answers: {}, consent: true, idempotencyKey: "emp-k1" })).application.id;

    // B is verified too, so these checks exercise isolation itself, not B's verification status.
    await db.update(organizations).set({ verificationStatus: "verified" }).where(eq(organizations.id, orgB));
    expect(await listApplicants(db, ids.ownerA, orgA)).toHaveLength(1);
    expect(await listApplicants(db, ids.ownerB, orgB)).toHaveLength(0);
    await expect(getApplicant(db, ids.ownerB, orgB, appA)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getApplicant(db, ids.ownerB, orgA, appA)).rejects.toMatchObject({ code: "NOT_FOUND" }); // not a member of A
    await expect(employerUpdateStatus(db, ids.ownerB, orgB, appA, "rejected")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addNote(db, ids.ownerB, orgB, appA, "peek")).rejects.toBeInstanceOf(EmployerError);
    await expect(employerTransition(db, ids.ownerB, orgB, oppA, "paused")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(orgAnalytics(db, ids.stranger, orgA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("resume documents: the receiving organization only, and audited", async () => {
    expect(await employerMayViewDocument(db, ids.ownerA, resumeDoc)).toBe(true);
    expect(await employerMayViewDocument(db, ids.ownerB, resumeDoc)).toBe(false);
    expect(await readDocumentForViewer(db, resumeDoc, { id: ids.ownerB, canViewAny: false, viaEmployer: () => employerMayViewDocument(db, ids.ownerB, resumeDoc) })).toBeNull();
    expect(await readDocumentForViewer(db, resumeDoc, { id: ids.ownerA, canViewAny: false, viaEmployer: () => employerMayViewDocument(db, ids.ownerA, resumeDoc) })).not.toBeNull();
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "document.view"));
    expect(logs.some((l) => l.actorIdentityId === ids.ownerA && l.actorRole === "employer")).toBe(true);
    const [d] = await db.select().from(documents).where(eq(documents.id, resumeDoc));
    expect(d.ownerIdentityId).toBe(ids.candidate);
  });

  it("invitations: token + sign-in, never email matching; roles limit access", async () => {
    const { link } = await inviteMember(db, ids.ownerA, orgA, { email: "Invitee@Example.com", role: "viewer" });
    const token = link.split("/").pop()!;
    await expect(acceptInvitation(db, ids.invitee, "not-the-token")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await acceptInvitation(db, ids.invitee, token)).toBe(orgA);
    await expect(acceptInvitation(db, ids.stranger, token)).rejects.toMatchObject({ code: "NOT_FOUND" }); // single use
    const asViewer = await getApplicant(db, ids.invitee, orgA, appA);
    expect(asViewer.notes).toBeNull();
    expect(asViewer.resumeUrl).toBeNull();
    await expect(employerUpdateStatus(db, ids.invitee, orgA, appA, "shortlisted")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(inviteMember(db, ids.invitee, orgA, { email: "x@example.com", role: "owner" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("owner manages members; the last owner can't be removed or demoted", async () => {
    await changeMemberRole(db, ids.ownerA, orgA, ids.invitee, "recruiter");
    await expect(changeMemberRole(db, ids.ownerA, orgA, ids.ownerA, "viewer")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(removeMember(db, ids.ownerA, orgA, ids.ownerA)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("status, notes, interviews and analytics for the owning organization", async () => {
    await employerUpdateStatus(db, ids.ownerA, orgA, appA, "shortlisted", "Strong portfolio");
    await addNote(db, ids.ownerA, orgA, appA, "Good React project");
    await scheduleInterview(db, ids.ownerA, orgA, appA, { scheduledAt: new Date(Date.now() + 3 * 86_400_000), durationMinutes: 30, mode: "video" });
    const a = await getApplicant(db, ids.ownerA, orgA, appA);
    expect(a.application.status).toBe("interview");
    expect(a.notes).toHaveLength(1);
    expect(a.resumeUrl).toMatch(/^\/api\/documents\//);
    const stats = await orgAnalytics(db, ids.ownerA, orgA);
    expect(stats.totals).toMatchObject({ applications: 1, shortlisted: 1, interviewed: 1 });
    // A later rejection keeps the funnel history.
    await employerUpdateStatus(db, ids.ownerA, orgA, appA, "rejected");
    expect((await orgAnalytics(db, ids.ownerA, orgA)).totals.interviewed).toBe(1);
  });
});
