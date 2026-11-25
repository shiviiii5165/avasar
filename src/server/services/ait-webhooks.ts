import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { audit } from "../audit";
import type { Db } from "../db/client";
import { aitWebhookDeliveries, candidateProfiles, userIdentities } from "../db/schema";
import { projectionSchema } from "../integrations/tathastu-profile";
import { log } from "../log";
import { deleteCandidateAccount } from "./account";
import { learningBatchSchema, storeLearningEvidence } from "./career";
import { storage } from "./documents";
import { applyTathastuProfile, clearTathastuImport, ProfileSyncError } from "./profile-sync";
import { ensureProfile } from "./profiles";

/**
 * AI Tathastu → Avsar server-to-server events (contract shared with Collaborate):
 *
 *   POST /api/webhooks/tathastu
 *   X-AIT-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *   X-AIT-Delivery:  <event id>   (must equal the signed body's `id`)
 *   X-AIT-Event:     profile.updated | integration.revoked
 *
 * profile.updated   creates the Avsar identity + PRIVATE profile on `reason: "auto_provision"` (only then,
 *                   so a late ordinary update can never recreate an account), otherwise updates it. Uses the
 *                   same importer as sign-in (applyTathastuProfile), so both paths follow one ownership rule.
 * integration.revoked
 *                   account_deleted → the Avsar account is deleted (deleteCandidateAccount);
 *                   anything else   → AI Tathastu's imported data is removed; the student's own data stays.
 *
 * Every response carries `outcome` from the shared vocabulary; an HTTP 200 alone never means "created".
 */

export const REPLAY_WINDOW_SEC = 5 * 60;
const LOCK_SEC = 60;
const PROVIDER = "ai_tathastu" as const;

export type SyncOutcome =
  | "created" | "updated" | "up_to_date" | "deleted" | "unlinked" | "ignored" | "ignored_consent"
  | "conflict" | "invalid_identity" | "rejected" | "retryable";

export type WebhookResult = { status: 200 | 400 | 401 | 409 | 500 | 503; outcome: SyncOutcome; action: string };

/** Constant-time check of the contract signature over the exact raw body, with a 5-minute replay window. */
export function verifySignature(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000)): { ok: true } | { ok: false; error: string } {
  if (!header) return { ok: false, error: "missing signature" };
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!parts.t || !Number.isInteger(t) || !parts.v1 || !/^[0-9a-f]{64}$/i.test(parts.v1)) return { ok: false, error: "malformed signature" };
  if (Math.abs(nowSec - t) > REPLAY_WINDOW_SEC) return { ok: false, error: "stale signature" };
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected) ? { ok: true } : { ok: false, error: "bad signature" };
}

/** A profile projection is a few KB; 512 KB leaves ample room while refusing memory-exhaustion bodies. */
export const MAX_WEBHOOK_BYTES = 512 * 1024;

/** Current secret first, then the previous one (accepted only while a rotation is in progress). */
export function webhookSecrets(env: Record<string, string | undefined> = process.env): string[] {
  return [env.AVSAR_AIT_WEBHOOK_SECRET, env.AVSAR_AIT_WEBHOOK_SECRET_PREVIOUS].map((s) => s?.trim() ?? "").filter((s) => s.length > 0);
}

export function verifyWithSecrets(rawBody: string, header: string | null, secrets: string[], nowSec?: number): { ok: true } | { ok: false; error: string } {
  let last: { ok: false; error: string } = { ok: false, error: "missing signature" };
  for (const secret of secrets) {
    const r = verifySignature(rawBody, header, secret, nowSec);
    if (r.ok) return r;
    last = r;
  }
  return last;
}

/** Reads the body up to `max` bytes; null when it is larger (declared or actual). Never buffers more than `max`. */
export async function readBoundedBody(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

type Claim ="claimed" | "processed" | "in_progress";

/** Exactly-once claim of a delivery id across instances (one atomic statement). */
async function claim(db: Db, deliveryId: string, eventType: string, subject: string | null): Promise<{ claim: Claim; outcome: string | null }> {
  const inserted = await db
    .insert(aitWebhookDeliveries)
    .values({ deliveryId, eventType, subject, lockedUntil: sql`now() + make_interval(secs => ${LOCK_SEC})` })
    .onConflictDoNothing()
    .returning({ id: aitWebhookDeliveries.deliveryId });
  if (inserted.length) return { claim: "claimed", outcome: null };
  // Existing: take it over only if it failed earlier or its processing lock expired.
  const retaken = await db
    .update(aitWebhookDeliveries)
    .set({ status: "processing", attempts: sql`${aitWebhookDeliveries.attempts} + 1`, lockedUntil: sql`now() + make_interval(secs => ${LOCK_SEC})` })
    .where(
      and(
        eq(aitWebhookDeliveries.deliveryId, deliveryId),
        sql`(${aitWebhookDeliveries.status} = 'failed' OR (${aitWebhookDeliveries.status} = 'processing' AND ${aitWebhookDeliveries.lockedUntil} < now()))`,
      ),
    )
    .returning({ id: aitWebhookDeliveries.deliveryId });
  if (retaken.length) return { claim: "claimed", outcome: null };
  const [row] = await db.select({ status: aitWebhookDeliveries.status, outcome: aitWebhookDeliveries.outcome }).from(aitWebhookDeliveries).where(eq(aitWebhookDeliveries.deliveryId, deliveryId));
  return { claim: row?.status === "processed" ? "processed" : "in_progress", outcome: row?.outcome ?? null };
}

async function finish(db: Db, deliveryId: string, status: "processed" | "failed", outcome: string, error: string | null = null) {
  await db
    .update(aitWebhookDeliveries)
    .set({ status, outcome, lastError: error?.slice(0, 300) ?? null, lockedUntil: null, processedAt: status === "processed" ? new Date() : null })
    .where(eq(aitWebhookDeliveries.deliveryId, deliveryId));
}

type Event = { id?: unknown; type?: unknown; createdAt?: unknown; data?: { userId?: unknown; reason?: unknown; profile?: unknown } };

/**
 * Processes one VERIFIED event (the route has checked the signature over the raw body).
 * `expectedAudience` is Avsar's client id at AI Tathastu: a profile issued for another app is rejected.
 */
export async function processWebhook(db: Db, event: Event, headers: { delivery: string | null; event: string | null }, expectedAudience: string): Promise<WebhookResult> {
  const deliveryId = typeof event?.id === "string" ? event.id : "";
  const type = typeof event?.type === "string" ? event.type : "";
  if (!deliveryId || !type) return { status: 400, outcome: "rejected", action: "MISSING_ID_OR_TYPE" };
  if (headers.delivery && headers.delivery !== deliveryId) return { status: 400, outcome: "rejected", action: "DELIVERY_ID_MISMATCH" };
  if (headers.event && headers.event !== type) return { status: 400, outcome: "rejected", action: "EVENT_TYPE_MISMATCH" };
  const subject = typeof event.data?.userId === "string" && event.data.userId ? event.data.userId : null;

  const c = await claim(db, deliveryId, type, subject);
  if (c.claim === "processed") return { status: 200, outcome: (c.outcome as SyncOutcome) ?? "up_to_date", action: "DUPLICATE_ACKNOWLEDGED" };
  if (c.claim === "in_progress") return { status: 409, outcome: "retryable", action: "DELIVERY_IN_PROGRESS" };

  try {
    const result = await handle(db, type, event, subject, expectedAudience);
    await finish(db, deliveryId, "processed", result.outcome);
    log("info", "ait_webhook.processed", { type, outcome: result.outcome, action: result.action });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finish(db, deliveryId, "failed", "retryable", message).catch(() => undefined);
    log("error", "ait_webhook.failed", { type, message: message.slice(0, 200) });
    return { status: 500, outcome: "retryable", action: "PROCESSING_FAILED_RETRYABLE" };
  }
}

async function handle(db: Db, type: string, event: Event, subject: string | null, expectedAudience: string): Promise<WebhookResult> {
  if (!subject) return { status: 200, outcome: "invalid_identity", action: "NO_USER_ID" };
  const [identity] = await db.select().from(userIdentities).where(and(eq(userIdentities.provider, PROVIDER), eq(userIdentities.subject, subject)));

  if (type === "integration.revoked") {
    if (!identity) return { status: 200, outcome: "ignored", action: "UNKNOWN_USER" };
    if (identity.deletedAt) return { status: 200, outcome: "up_to_date", action: "ALREADY_DELETED" };
    const [profile] = await db.select({ id: candidateProfiles.id }).from(candidateProfiles).where(eq(candidateProfiles.identityId, identity.id));
    if (event.data?.reason === "account_deleted") {
      // Avsar signs in only through AI Tathastu: with that account gone, the Avsar account goes too.
      const keys = await deleteCandidateAccount(db, { identityId: identity.id, profileId: profile?.id ?? null, actor: { id: null, role: "system" }, reason: "ait_account_deleted" });
      for (const key of keys) await storage().remove(key).catch(() => undefined);
      return { status: 200, outcome: "deleted", action: "ACCOUNT_DELETED" };
    }
    if (profile) await clearTathastuImport(db, profile.id, null);
    return { status: 200, outcome: "unlinked", action: "IMPORT_REMOVED" };
  }

  if (type === "learning.evidence") {
    // Structured learning activity only (see docs/AI_TATHASTU_INTEGRATION.md §Learning evidence). Never creates an account.
    if (!identity || identity.deletedAt || identity.disabledAt) return { status: 200, outcome: "ignored", action: "UNKNOWN_USER" };
    const [profile] = await db.select({ id: candidateProfiles.id }).from(candidateProfiles).where(eq(candidateProfiles.identityId, identity.id));
    if (!profile) return { status: 200, outcome: "ignored", action: "NO_PROFILE" };
    const parsed = learningBatchSchema.safeParse((event.data as { events?: unknown } | undefined)?.events);
    if (!parsed.success) return { status: 200, outcome: "rejected", action: "INVALID_LEARNING_EVENTS" };
    const r = await storeLearningEvidence(db, profile.id, parsed.data);
    if (!r.consent) return { status: 200, outcome: "ignored_consent", action: "NO_LEARNING_CONSENT" };
    return { status: 200, outcome: r.stored ? "updated" : "up_to_date", action: `LEARNING_STORED_${r.stored}` };
  }

  if (type !== "profile.updated") return { status: 200, outcome: "ignored", action: `IGNORED_EVENT_${type}` };

  const parsed = projectionSchema.safeParse(event.data?.profile);
  if (!parsed.success) return { status: 200, outcome: "rejected", action: "INVALID_PROJECTION" };
  const p = parsed.data;
  if (p.identity.id !== subject) return { status: 200, outcome: "invalid_identity", action: "SUBJECT_MISMATCH" };
  if (p.audience && p.audience !== expectedAudience) return { status: 200, outcome: "rejected", action: "AUDIENCE_MISMATCH" };

  // The student deleted this Avsar account (or it was deleted for them): never recreate it from an event.
  if (identity?.deletedAt || identity?.disabledAt) return { status: 200, outcome: "ignored_consent", action: "ACCOUNT_DELETED_HERE" };

  let identityId = identity?.id;
  let created = false;
  if (!identityId) {
    if (event.data?.reason !== "auto_provision") return { status: 200, outcome: "ignored", action: "UNKNOWN_USER" };
    // AI Tathastu admits only provider-verified addresses (sign-in policy), so the address is verified.
    const [row] = await db
      .insert(userIdentities)
      .values({ provider: PROVIDER, subject, email: p.identity.email?.toLowerCase().trim() || null, emailVerified: Boolean(p.identity.email), name: p.identity.name ?? null })
      .onConflictDoNothing()
      .returning({ id: userIdentities.id });
    if (row) {
      identityId = row.id;
      created = true;
    } else {
      const [raced] = await db.select({ id: userIdentities.id }).from(userIdentities).where(and(eq(userIdentities.provider, PROVIDER), eq(userIdentities.subject, subject)));
      identityId = raced.id;
    }
  }

  // Created empty: the importer then fills the name as AI Tathastu-owned, so it updates and is removed on
  // revocation. (Pre-filling it here would make it look like the student's own edit.)
  const profile = await ensureProfile(db, identityId, null);
  // Out-of-order protection: a projection older than what was last imported (by sign-in or an earlier event) is skipped.
  const generatedAt = Date.parse((event.data?.profile as { generatedAt?: string } | undefined)?.generatedAt ?? "");
  // Tombstone: a disconnect must not be undone by a delayed or retried profile built before it. Without a
  // readable generatedAt the order can't be proven, so the event is skipped too (the next real change resends it).
  if (!created && profile.aitUnlinkedAt && (Number.isNaN(generatedAt) || generatedAt <= profile.aitUnlinkedAt.getTime())) {
    return { status: 200, outcome: "ignored", action: "IGNORED_BEFORE_UNLINK" };
  }
  if (!created && profile.aitSyncedAt && !Number.isNaN(generatedAt) && generatedAt <= profile.aitSyncedAt.getTime()) {
    return { status: 200, outcome: "up_to_date", action: "IGNORED_STALE" };
  }
  try {
    await applyTathastuProfile(db, profile.id, p, subject, null, expectedAudience);
  } catch (err) {
    if (err instanceof ProfileSyncError) return { status: 200, outcome: err.code === "SUBJECT_MISMATCH" ? "invalid_identity" : "rejected", action: err.code };
    throw err;
  }
  if (created) await audit(db, { actorId: null, actorRole: "system", action: "account.auto_provisioned", targetType: "identity", targetId: identityId, metadata: { provider: PROVIDER } });
  return { status: 200, outcome: created ? "created" : "updated", action: created ? "AUTO_PROVISIONED_PRIVATE" : "PROFILE_UPDATED" };
}
