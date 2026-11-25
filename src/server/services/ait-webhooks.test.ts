import { createHmac, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { upsertIdentity } from "../auth/identity";
import { createMemoryDb, type Db } from "../db/client";
import { aitWebhookDeliveries, candidateProfiles, candidateSkills, education, sessions, userIdentities } from "../db/schema";
import { MAX_WEBHOOK_BYTES, processWebhook, readBoundedBody, REPLAY_WINDOW_SEC, verifySignature, verifyWithSecrets, webhookSecrets } from "./ait-webhooks";
import { addSectionItem, ensureProfile, loadProfile } from "./profiles";

const AUD = "avasar";
const projection = (sub: string, over: Record<string, unknown> = {}) => ({
  schema: "ProfessionalProjectionV1",
  version: 1,
  audience: AUD,
  generatedAt: new Date().toISOString(),
  identity: { id: sub, email: `${sub}@example.invalid`, name: "Asha Rao", headline: "Data student", avatarUrl: null, careerRole: { id: "ds", label: "Data Scientist" }, location: { city: "Pune", country: "India" } },
  education: [{ institution: "COEP", degree: "B.Tech", fieldOfStudy: "CS", dates: "2022 - 2026", grade: null }],
  skills: { items: [{ name: "Python", category: null, verified: true, verificationStatus: "verified", proficiency: null, level: null }] },
  projects: null,
  experience: null,
  achievements: null,
  privacy: { scopes: { education: true, skills: true }, masked: ["projects", "experience", "achievements"] },
  ...over,
});
const updated = (sub: string, reason = "auto_provision", over: Record<string, unknown> = {}) => ({
  id: randomUUID(), type: "profile.updated", createdAt: new Date().toISOString(), data: { userId: sub, reason, profile: projection(sub, over) },
});
const revoked = (sub: string, reason: string) => ({ id: randomUUID(), type: "integration.revoked", createdAt: new Date().toISOString(), data: { userId: sub, reason } });
const send = (db: Db, e: { id: string; type: string }) => processWebhook(db, e, { delivery: e.id, event: e.type }, AUD);
const identityOf = async (db: Db, sub: string) =>
  (await db.select().from(userIdentities).where(and(eq(userIdentities.provider, "ai_tathastu"), eq(userIdentities.subject, sub))))[0];
const profileOf = async (db: Db, identityId: string) => (await db.select().from(candidateProfiles).where(eq(candidateProfiles.identityId, identityId)))[0];

describe("verifySignature (contract: t=<unix>,v1=<hex HMAC(secret, t.body)>)", () => {
  const secret = "s3cret";
  const sign = (body: string, t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
  const now = 1_800_000_000;
  it("accepts a fresh, correct signature", () => expect(verifySignature("{}", sign("{}", now), secret, now)).toEqual({ ok: true }));
  it("rejects a tampered body", () => expect(verifySignature('{"x":1}', sign("{}", now), secret, now).ok).toBe(false));
  it("rejects a replay outside the window", () => expect(verifySignature("{}", sign("{}", now - REPLAY_WINDOW_SEC - 1), secret, now).ok).toBe(false));
  it("rejects a future timestamp outside the window", () => expect(verifySignature("{}", sign("{}", now + REPLAY_WINDOW_SEC + 1), secret, now).ok).toBe(false));
  it("rejects missing or malformed headers", () => {
    expect(verifySignature("{}", null, secret, now).ok).toBe(false);
    expect(verifySignature("{}", "t=abc,v1=zz", secret, now).ok).toBe(false);
    expect(verifySignature("{}", `t=${now}`, secret, now).ok).toBe(false);
  });
  it("rejects the wrong secret", () => expect(verifySignature("{}", sign("{}", now), "other", now).ok).toBe(false));
});

describe("processWebhook (PGlite, real migrations)", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createMemoryDb();
  });

  it("auto_provision creates ONE identity and a PRIVATE profile with imported data → created", async () => {
    const r = await send(db, updated("ait-new-1"));
    expect(r).toMatchObject({ status: 200, outcome: "created", action: "AUTO_PROVISIONED_PRIVATE" });
    const id = await identityOf(db, "ait-new-1");
    expect(id.email).toBe("ait-new-1@example.invalid");
    expect(id.lastLoginAt).toBeNull();
    const p = await profileOf(db, id.id);
    expect(p.visibility).toBe("private");
    expect(p.aitSyncStatus).not.toBe("never");
    const full = await loadProfile(db, p.id);
    expect(full?.skills.map((s) => s.name)).toContain("Python");
  });

  it("the same delivery twice is applied once (duplicate protection) and reports the original outcome", async () => {
    const e = updated("ait-dup");
    expect((await send(db, e)).outcome).toBe("created");
    const again = await send(db, e);
    expect(again).toMatchObject({ status: 200, action: "DUPLICATE_ACKNOWLEDGED", outcome: "created" });
    const rows = await db.select().from(userIdentities).where(eq(userIdentities.subject, "ait-dup"));
    expect(rows).toHaveLength(1);
  });

  it("concurrent provisioning of the same user creates exactly one identity and one profile", async () => {
    const results = await Promise.all([send(db, updated("ait-race")), send(db, updated("ait-race")), send(db, updated("ait-race"))]);
    expect(results.filter((r) => r.outcome === "created").length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => ["created", "updated", "up_to_date"].includes(r.outcome))).toBe(true);
    const ids = await db.select().from(userIdentities).where(eq(userIdentities.subject, "ait-race"));
    expect(ids).toHaveLength(1);
    expect(await db.select().from(candidateProfiles).where(eq(candidateProfiles.identityId, ids[0].id))).toHaveLength(1);
  });

  it("an ordinary update for an unknown user never creates an account → ignored", async () => {
    const r = await send(db, updated("ait-unknown", "profile_recomputed"));
    expect(r.outcome).toBe("ignored");
    expect(await identityOf(db, "ait-unknown")).toBeUndefined();
  });

  it("matches by AI Tathastu id only: an existing account with the same EMAIL but another subject is untouched", async () => {
    const other = await upsertIdentity(db, { provider: "ai_tathastu", subject: "ait-other", email: "same@example.invalid", emailVerified: true, name: "Other" });
    const r = await send(db, updated("ait-same-email", "auto_provision", { identity: { id: "ait-same-email", email: "same@example.invalid", name: "New" } }));
    expect(r.outcome).toBe("created");
    const mine = await identityOf(db, "ait-same-email");
    expect(mine.id).not.toBe(other.id);
    expect((await identityOf(db, "ait-other")).name).toBe("Other");
  });

  it("an update applies to the existing profile → updated; a student-edited field is kept", async () => {
    const id = await identityOf(db, "ait-new-1");
    const p = await profileOf(db, id.id);
    await db.update(candidateProfiles).set({ headline: "My own headline" }).where(eq(candidateProfiles.id, p.id));
    const r = await send(db, updated("ait-new-1", "profile_recomputed", { identity: { id: "ait-new-1", email: "ait-new-1@example.invalid", name: "Asha Rao", headline: "Changed upstream" } }));
    expect(r.outcome).toBe("updated");
    expect((await profileOf(db, id.id)).headline).toBe("My own headline");
  });

  it("out-of-order: a projection older than the last import is skipped → up_to_date", async () => {
    const old = updated("ait-new-1", "profile_recomputed", { generatedAt: new Date(Date.now() - 3600_000).toISOString() });
    expect((await send(db, old)).outcome).toBe("up_to_date");
  });

  it("rejects a projection for another user, another app, or a malformed payload", async () => {
    const mismatch = updated("ait-new-1", "profile_recomputed");
    (mismatch.data.profile as { identity: { id: string } }).identity.id = "someone-else";
    expect((await send(db, mismatch)).outcome).toBe("invalid_identity");
    expect((await send(db, updated("ait-new-1", "profile_recomputed", { audience: "collaborate" }))).outcome).toBe("rejected");
    const bad = { id: randomUUID(), type: "profile.updated", data: { userId: "ait-new-1", reason: "x", profile: { nope: true } } };
    expect((await send(db, bad)).outcome).toBe("rejected");
    expect((await send(db, { id: "", type: "" })).status).toBe(400);
  });

  it("a header delivery id that disagrees with the signed body is rejected", async () => {
    const e = updated("ait-new-1", "profile_recomputed");
    expect((await processWebhook(db, e, { delivery: "other-id", event: e.type }, AUD)).status).toBe(400);
  });

  it("user_disconnected removes AI Tathastu's data but keeps the student's own additions → unlinked", async () => {
    await send(db, updated("ait-disc"));
    const id = await identityOf(db, "ait-disc");
    const p = await profileOf(db, id.id);
    await addSectionItem(db, p.id, "education", { institution: "My own school", source: "avsar" });
    const r = await send(db, revoked("ait-disc", "user_disconnected"));
    expect(r.outcome).toBe("unlinked");
    const edu = await db.select().from(education).where(eq(education.profileId, p.id));
    expect(edu.map((e) => e.institution)).toEqual(["My own school"]);
    expect(await db.select().from(candidateSkills).where(and(eq(candidateSkills.profileId, p.id), eq(candidateSkills.source, "ai_tathastu")))).toHaveLength(0);
    const after = await profileOf(db, id.id);
    expect(after.aitSyncStatus).toBe("never");
    expect(after.fullName).toBeNull(); // the imported name is removed; it was never edited here
    expect((await identityOf(db, "ait-disc")).deletedAt).toBeNull(); // the account itself stays
  });

  it("tombstone: a delayed or retried profile built before a disconnect is never imported; a newer one is", async () => {
    const before = new Date(Date.now() - 1000).toISOString();
    await send(db, updated("ait-tomb"));
    const id = await identityOf(db, "ait-tomb");
    expect((await send(db, revoked("ait-tomb", "user_disconnected"))).outcome).toBe("unlinked");
    const p = await profileOf(db, id.id);
    expect(p.aitUnlinkedAt).toBeInstanceOf(Date);

    const late = await send(db, updated("ait-tomb", "profile_recomputed", { generatedAt: before }));
    expect(late).toMatchObject({ outcome: "ignored", action: "IGNORED_BEFORE_UNLINK" });
    const noDate = updated("ait-tomb", "profile_recomputed");
    delete (noDate.data.profile as { generatedAt?: string }).generatedAt;
    expect((await send(db, noDate)).action).toBe("IGNORED_BEFORE_UNLINK");
    expect(await db.select().from(candidateSkills).where(and(eq(candidateSkills.profileId, p.id), eq(candidateSkills.source, "ai_tathastu")))).toHaveLength(0);

    // A relink on AI Tathastu produces a fresh projection, which is imported.
    const fresh = await send(db, updated("ait-tomb", "auto_provision", { generatedAt: new Date(Date.now() + 1000).toISOString() }));
    expect(fresh.outcome).toBe("updated");
    expect(await db.select().from(candidateSkills).where(and(eq(candidateSkills.profileId, p.id), eq(candidateSkills.source, "ai_tathastu")))).not.toHaveLength(0);
  });

  it("partial withdrawal: a section now masked is removed; the other shared sections stay", async () => {
    await send(db, updated("ait-part"));
    const id = await identityOf(db, "ait-part");
    const p = await profileOf(db, id.id);
    const r = await send(db, updated("ait-part", "consent_changed", {
      generatedAt: new Date(Date.now() + 1000).toISOString(),
      education: null,
      privacy: { scopes: { education: false, skills: true }, masked: ["education", "projects", "experience", "achievements"] },
    }));
    expect(r.outcome).toBe("updated");
    expect(await db.select().from(education).where(eq(education.profileId, p.id))).toHaveLength(0);
    expect(await db.select().from(candidateSkills).where(and(eq(candidateSkills.profileId, p.id), eq(candidateSkills.source, "ai_tathastu")))).not.toHaveLength(0);
  });

  it("account_deleted deletes the Avsar account: data erased, identity minimized, sessions revoked → deleted", async () => {
    await send(db, updated("ait-del"));
    const id = await identityOf(db, "ait-del");
    await db.insert(sessions).values({ identityId: id.id, tokenHash: `h-${randomUUID()}`, expiresAt: new Date(Date.now() + 3600_000) });
    const r = await send(db, revoked("ait-del", "account_deleted"));
    expect(r.outcome).toBe("deleted");
    const gone = await identityOf(db, "ait-del");
    expect(gone.deletedAt).not.toBeNull();
    expect(gone.email).toBeNull();
    expect(gone.name).toBeNull();
    const s = await db.select().from(sessions).where(eq(sessions.identityId, id.id));
    expect(s.every((x) => x.revokedAt !== null)).toBe(true);
    const p = await profileOf(db, id.id);
    expect(p.fullName).toBeNull();
    expect(await db.select().from(candidateSkills).where(eq(candidateSkills.profileId, p.id))).toHaveLength(0);
  });

  it("after deletion, a late event never recreates the account; a repeat deletion is harmless", async () => {
    expect((await send(db, updated("ait-del"))).outcome).toBe("ignored_consent");
    expect((await send(db, revoked("ait-del", "account_deleted"))).outcome).toBe("up_to_date");
  });

  it("re-registration on AI Tathastu (new id, same email) gets a fresh Avsar account", async () => {
    const r = await send(db, updated("ait-del-2", "auto_provision", { identity: { id: "ait-del-2", email: "ait-del@example.invalid", name: "Back Again" } }));
    expect(r.outcome).toBe("created");
  });

  it("revocation for an unknown user is ignored", async () => {
    expect((await send(db, revoked("ait-nobody", "account_deleted"))).outcome).toBe("ignored");
  });

  it("a processing failure is retryable and succeeds on redelivery of the same id", async () => {
    const e = updated("ait-retry");
    // Simulate an earlier failed attempt for this delivery id.
    await db.insert(aitWebhookDeliveries).values({ deliveryId: e.id, eventType: e.type, subject: "ait-retry", status: "failed", lastError: "boom" });
    const r = await send(db, e);
    expect(r.outcome).toBe("created");
    const [row] = await db.select().from(aitWebhookDeliveries).where(eq(aitWebhookDeliveries.deliveryId, e.id));
    expect(row).toMatchObject({ status: "processed", outcome: "created", attempts: 2 });
  });

  it("a delivery being processed elsewhere answers 409 retryable", async () => {
    const e = updated("ait-busy");
    await db.insert(aitWebhookDeliveries).values({ deliveryId: e.id, eventType: e.type, subject: "ait-busy", status: "processing", lockedUntil: new Date(Date.now() + 60_000) });
    expect(await send(db, e)).toMatchObject({ status: 409, outcome: "retryable" });
  });

  it("the sign-in importer and the webhook share one profile (no second profile for the same identity)", async () => {
    const id = await identityOf(db, "ait-new-1");
    const again = await ensureProfile(db, id.id, null);
    expect(again.id).toBe((await profileOf(db, id.id)).id);
  });
});

describe("webhook transport hardening", () => {
  const sign = (body: string, secret: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

  it("accepts the previous secret only while it is configured (rotation)", () => {
    const body = JSON.stringify({ id: "x" });
    const secrets = webhookSecrets({ AVSAR_AIT_WEBHOOK_SECRET: "new-secret", AVSAR_AIT_WEBHOOK_SECRET_PREVIOUS: "old-secret" });
    expect(verifyWithSecrets(body, sign(body, "old-secret"), secrets).ok).toBe(true);
    expect(verifyWithSecrets(body, sign(body, "new-secret"), secrets).ok).toBe(true);
    expect(verifyWithSecrets(body, sign(body, "old-secret"), webhookSecrets({ AVSAR_AIT_WEBHOOK_SECRET: "new-secret" })).ok).toBe(false);
    expect(verifyWithSecrets(body, sign(body, "attacker"), secrets).ok).toBe(false);
    expect(webhookSecrets({ AVSAR_AIT_WEBHOOK_SECRET: "  " })).toEqual([]);
  });

  it("refuses oversized bodies, declared or streamed", async () => {
    const big = "x".repeat(MAX_WEBHOOK_BYTES + 1);
    expect(await readBoundedBody(new Request("https://a.test", { method: "POST", body: big }), MAX_WEBHOOK_BYTES)).toBeNull();
    const undeclared = new Request("https://a.test", { method: "POST", body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } }), duplex: "half" } as RequestInit);
    expect(await readBoundedBody(undeclared, MAX_WEBHOOK_BYTES)).toBeNull();
    expect(await readBoundedBody(new Request("https://a.test", { method: "POST", body: "{\"ok\":1}" }), MAX_WEBHOOK_BYTES)).toBe("{\"ok\":1}");
  });
});
