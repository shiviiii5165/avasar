import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createMemoryDb, type Db } from "../db/client";
import { applicationEvents, applications, auditLogs, jobs, notifications, opportunities, opportunitySources, userIdentities } from "../db/schema";
import { createSession, resolveSession, revokeSession, upsertIdentity } from "../auth/identity";
import { seedSamples } from "../seed";
import { ApplyError, changeApplicationStatus, submitApplication } from "./applications";
import { deleteResume, detectType, signedDocumentUrl, uploadResume, UploadError, verifyDocumentSignature } from "./documents";
import { listSaved, toggleSaved } from "./engagement";
import { claimJobs, defaultHandlers, runJob } from "./jobs";
import { createOpportunity, importBatch, searchOpportunities, searchSchema, transitionOpportunity, TransitionError } from "./opportunities";
import { addSectionItem, ensureProfile, loadProfile, replaceSkills, toCandidateFacts } from "./profiles";
import { fileReport, listCases, resolveCase } from "./trust";

let db: Db;
let candidateId: string;
let profileId: string;
let adminId: string;

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

beforeAll(async () => {
  db = await createMemoryDb();
  await seedSamples(db);
  const cand = await upsertIdentity(db, { provider: "dev", subject: "cand-1", email: "c@example.invalid", emailVerified: true, name: "Cand" });
  candidateId = cand.id;
  profileId = (await ensureProfile(db, cand.id, "Cand"))!.id;
  adminId = (await upsertIdentity(db, { provider: "dev", subject: "admin-1", email: null, emailVerified: false, name: "Admin" })).id;
});

const internal = async () => (await db.select().from(opportunities).where(eq(opportunities.title, "Frontend Developer Intern")))[0];
const external = async () => (await db.select().from(opportunities).where(eq(opportunities.applicationMethod, "external")))[0];

describe("identity and sessions", () => {
  it("links by provider subject only, never by email", async () => {
    const a = await upsertIdentity(db, { provider: "ai_tathastu", subject: "sub-A", email: "same@example.invalid", emailVerified: true, name: "A" });
    const b = await upsertIdentity(db, { provider: "ai_tathastu", subject: "sub-B", email: "same@example.invalid", emailVerified: true, name: "B" });
    expect(a.id).not.toBe(b.id);
  });
  it("creates, resolves and revokes sessions; stores only a hash", async () => {
    const s = await createSession(db, candidateId);
    expect((await resolveSession(db, s.token))?.identity.id).toBe(candidateId);
    const stored = await db.select().from(userIdentities).where(eq(userIdentities.id, candidateId));
    expect(JSON.stringify(stored)).not.toContain(s.token);
    await revokeSession(db, s.token);
    expect(await resolveSession(db, s.token)).toBeNull();
    expect(await resolveSession(db, "not-a-real-token-at-all-xxxxx")).toBeNull();
  });
});

describe("discovery", () => {
  it("returns only published, open listings with filters and pagination", async () => {
    const all = await searchOpportunities(db, searchSchema.parse({}));
    expect(all.total).toBe(9);
    const interns = await searchOpportunities(db, searchSchema.parse({ category: "internship" }));
    expect(interns.items.every((i) => i.category === "internship")).toBe(true);
    const bySkill = await searchOpportunities(db, searchSchema.parse({ q: "pytorch" }));
    expect(bySkill.items.map((i) => i.title)).toContain("Machine Learning Intern — Crop Health");
    const remote = await searchOpportunities(db, searchSchema.parse({ workMode: "remote" }));
    expect(remote.items.every((i) => i.workMode === "remote")).toBe(true);
  });
  it("hides drafts and expired listings", async () => {
    await createOpportunity(db, { title: "Hidden draft role", category: "job", organizationName: "X Org", description: "d".repeat(60), workMode: "remote", applicationMethod: "internal", locations: "", requiredSkills: "", preferredSkills: "", educationLevels: [], requiresWorkAuthorizationIndia: false, unpaid: false, conversionPossible: false }, adminId);
    const res = await searchOpportunities(db, searchSchema.parse({ q: "Hidden draft" }));
    expect(res.total).toBe(0);
  });
});

describe("admin pipeline", () => {
  it("never publishes without review and validates before approval", async () => {
    const draft = await createOpportunity(db, { title: "Ops Associate", category: "job", organizationName: "Org", description: "o".repeat(60), workMode: "onsite", applicationMethod: "external", externalUrl: "http://insecure.example", locations: "Delhi", requiredSkills: "Excel", preferredSkills: "", educationLevels: [], requiresWorkAuthorizationIndia: false, unpaid: false, conversionPossible: false }, adminId);
    await expect(transitionOpportunity(db, draft.id, "published", adminId)).rejects.toThrow(TransitionError);
    await transitionOpportunity(db, draft.id, "in_review", adminId);
    const err = await transitionOpportunity(db, draft.id, "approved", adminId).catch((e) => e);
    expect(err).toBeInstanceOf(TransitionError);
    expect((err as TransitionError).problems.join()).toMatch(/https/);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.targetId, draft.id));
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["opportunity.create", "opportunity.in_review"]));
  });
  it("imports into review, flags invalid items and deduplicates", async () => {
    const [src] = await db.select().from(opportunitySources);
    const item = { title: "Support Engineer", organization: "Feed Co", description: "s".repeat(80), sourceUrl: "https://feed.example/1", applyUrl: "https://feed.example/apply/1", skills: ["Linux"] };
    const first = await importBatch(db, src.id, [item, { title: "x", organization: "y" }, { nonsense: true }], adminId);
    expect(first).toEqual({ queued: 1, duplicate: 0, invalid: 2 });
    const second = await importBatch(db, src.id, [item], adminId);
    expect(second.duplicate).toBe(1);
    const [row] = await db.select().from(opportunities).where(eq(opportunities.title, "Support Engineer"));
    expect(row.status).toBe("in_review"); // never auto-published
    expect(row.sourceUrl).toBe("https://feed.example/1");
  });
});

describe("applications", () => {
  it("submits once with snapshots, events and a queued notification; replays are idempotent", async () => {
    await replaceSkills(db, profileId, ["React", "TypeScript"]);
    await addSectionItem(db, profileId, "education", { institution: "COEP", level: "bachelors", graduationYear: 2026 });
    const opp = await internal();
    const profile = (await loadProfile(db, profileId))!;
    const input = { opportunityId: opp.id, resumeId: null, answers: { motivation: "I build accessible UIs." }, consent: true, idempotencyKey: "idem-1" };
    const first = await submitApplication(db, profile, candidateId, input);
    const again = await submitApplication(db, profile, candidateId, input);
    expect(again.replayed).toBe(true);
    expect(again.application.id).toBe(first.application.id);
    expect((first.application.profileSnapshot as { skills: string[] }).skills).toEqual(["React", "TypeScript"]);
    const events = await db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, first.application.id));
    expect(events).toHaveLength(1);
    expect((await db.select().from(notifications).where(eq(notifications.identityId, candidateId))).length).toBe(1);
    expect((await db.select().from(jobs).where(eq(jobs.type, "email.notification"))).length).toBe(1);
  });
  it("refuses duplicates, missing consent, missing answers, external and closed listings", async () => {
    const opp = await internal();
    const profile = (await loadProfile(db, profileId))!;
    const dup = await submitApplication(db, profile, candidateId, { opportunityId: opp.id, resumeId: null, answers: { motivation: "x" }, consent: true, idempotencyKey: "idem-2" }).catch((e) => e);
    expect((dup as ApplyError).code).toBe("DUPLICATE");
    const noConsent = await submitApplication(db, profile, candidateId, { opportunityId: opp.id, resumeId: null, answers: {}, consent: false, idempotencyKey: "idem-3" }).catch((e) => e);
    expect((noConsent as ApplyError).code).toBe("CONSENT");
    const ext = await external();
    const extErr = await submitApplication(db, profile, candidateId, { opportunityId: ext.id, resumeId: null, answers: {}, consent: true, idempotencyKey: "idem-4" }).catch((e) => e);
    expect((extErr as ApplyError).code).toBe("EXTERNAL");
    const [ml] = await db.select().from(opportunities).where(eq(opportunities.title, "Machine Learning Intern — Crop Health"));
    const noAnswer = await submitApplication(db, profile, candidateId, { opportunityId: ml.id, resumeId: null, answers: {}, consent: true, idempotencyKey: "idem-5" }).catch((e) => e);
    expect((noAnswer as ApplyError).code).toBe("ANSWERS");
    await db.update(opportunities).set({ deadline: new Date(Date.now() - 1000) }).where(eq(opportunities.id, ml.id));
    const closed = await submitApplication(db, profile, candidateId, { opportunityId: ml.id, resumeId: null, answers: { motivation: "x" }, consent: true, idempotencyKey: "idem-6" }).catch((e) => e);
    expect((closed as ApplyError).code).toBe("CLOSED");
  });
  it("records status history; candidates can only withdraw their own", async () => {
    const [app] = await db.select().from(applications).where(eq(applications.profileId, profileId));
    await changeApplicationStatus(db, app.id, "under_review", { id: adminId, role: "admin" }, "Looks relevant");
    await expect(changeApplicationStatus(db, app.id, "shortlisted", { id: candidateId, role: "candidate" }, undefined, profileId)).rejects.toThrow(/INVALID_TRANSITION/);
    await expect(changeApplicationStatus(db, app.id, "withdrawn", { id: candidateId, role: "candidate" }, undefined, "someone-else")).rejects.toThrow("NOT_FOUND");
    await changeApplicationStatus(db, app.id, "withdrawn", { id: candidateId, role: "candidate" }, undefined, profileId);
    const events = await db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, app.id)).orderBy(applicationEvents.at);
    expect(events.map((e) => e.toStatus)).toEqual(["submitted", "under_review", "withdrawn"]);
    expect(events[1].reason).toBe("Looks relevant");
  });
  it("feeds matching facts from the stored profile", async () => {
    const facts = toCandidateFacts((await loadProfile(db, profileId))!);
    expect(facts.skills.map((s) => s.name)).toEqual(["React", "TypeScript"]);
    expect(facts.education[0].level).toBe("bachelors");
  });
});

describe("documents", () => {
  it("validates by content, not name", () => {
    expect(detectType(PDF)?.ext).toBe("pdf");
    expect(detectType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(detectType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBeNull(); // a zip that isn't a .docx
  });
  it("uploads privately, signs short-lived per-viewer links and deletes", async () => {
    await expect(uploadResume(db, { identityId: candidateId, profileId }, { name: "evil.pdf", bytes: Buffer.from("MZ...") })).rejects.toThrow(UploadError);
    await expect(uploadResume(db, { identityId: candidateId, profileId }, { name: "big.pdf", bytes: Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]) })).rejects.toThrow(/5 MB/);
    const r = await uploadResume(db, { identityId: candidateId, profileId }, { name: "Cand CV.pdf", bytes: PDF });
    expect(r.isDefault).toBe(true);
    const url = new URL(signedDocumentUrl(r.documentId, candidateId), "http://x");
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig")!;
    expect(verifyDocumentSignature(r.documentId, candidateId, exp, sig)).toBe(true);
    expect(verifyDocumentSignature(r.documentId, adminId, exp, sig)).toBe(false); // bound to the viewer
    expect(verifyDocumentSignature(r.documentId, candidateId, exp, sig, (exp + 1) * 1000)).toBe(false); // expires
    await deleteResume(db, { identityId: candidateId, profileId }, r.id);
    expect((await loadProfile(db, profileId))!.resumes).toHaveLength(0);
  });
});

describe("trust and safety", () => {
  it("report → case → suspend removes the listing from public view, with audit", async () => {
    const opp = await external();
    await fileReport(db, candidateId, { opportunityId: opp.id, reason: "payment_demand", details: "Asked for a registration fee" });
    const [kase] = (await listCases(db, "open")).filter((c) => c.c.targetId === opp.id);
    expect(kase.c.severity).toBe("critical");
    await resolveCase(db, kase.c.id, "suspend_opportunity", "Fee demand confirmed", adminId);
    const res = await searchOpportunities(db, searchSchema.parse({ q: opp.title }));
    expect(res.total).toBe(0);
    await expect(resolveCase(db, kase.c.id, "none", "again", adminId)).rejects.toThrow("ALREADY_RESOLVED");
  });
});

describe("saved and jobs", () => {
  it("saves and unsaves only visible listings", async () => {
    const opp = await internal();
    expect(await toggleSaved(db, candidateId, opp.id)).toBe(true);
    expect((await listSaved(db, candidateId)).map((o) => o.id)).toContain(opp.id);
    expect(await toggleSaved(db, candidateId, opp.id)).toBe(false);
  });
  it("retries failed jobs with backoff and dead-letters after max attempts", async () => {
    const failing = { "email.notification": async () => { throw new Error("provider down"); } };
    for (let i = 0; i < 6; i++) {
      await db.update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.status, "queued"));
      for (const j of await claimJobs(db, 10)) await runJob(db, j, failing);
    }
    const [j] = await db.select().from(jobs).where(eq(jobs.type, "email.notification"));
    expect(j.status).toBe("dead");
    expect(j.lastError).toMatch(/provider down/);
    expect(Object.keys(defaultHandlers)).toContain("opportunity.expire");
  });
});
