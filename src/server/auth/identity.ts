import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { audit } from "../audit";
import { bootstrapSuperAdmins } from "../config";
import type { Db } from "../db/client";
import { adminRoles, candidateProfiles, sessions, userIdentities } from "../db/schema";
import type { AdminRole } from "../domain/permissions";

export const SESSION_COOKIE = "avsar_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export interface VerifiedIdentity {
  provider: "ai_tathastu" | "dev";
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/**
 * Finds or creates the local identity for a VERIFIED provider subject. Linking is by
 * (provider, subject) only: a matching email never links two identities.
 */
export async function upsertIdentity(db: Db, v: VerifiedIdentity) {
  const now = new Date();
  const [row] = await db
    .insert(userIdentities)
    .values({ provider: v.provider, subject: v.subject, email: v.email, emailVerified: v.emailVerified, name: v.name, lastLoginAt: now })
    .onConflictDoUpdate({
      target: [userIdentities.provider, userIdentities.subject],
      set: { email: v.email, emailVerified: v.emailVerified, name: v.name, lastLoginAt: now },
    })
    .returning();
  if (row.disabledAt || row.deletedAt) throw new Error("ACCOUNT_DISABLED");

  if (bootstrapSuperAdmins().includes(`${v.provider}:${v.subject}`)) {
    const inserted = await db.insert(adminRoles).values({ identityId: row.id, role: "super_admin" }).onConflictDoNothing().returning();
    if (inserted.length) await audit(db, { actorId: row.id, actorRole: "system", action: "admin.bootstrap_grant", targetType: "identity", targetId: row.id, metadata: { role: "super_admin" } });
  }
  return row;
}

export async function createSession(db: Db, identityId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ identityId, tokenHash: sha256(token), expiresAt });
  return { token, expiresAt };
}

export interface SessionContext {
  sessionId: string;
  identity: typeof userIdentities.$inferSelect;
  roles: AdminRole[];
  profileId: string | null;
  onboarded: boolean;
}

export async function resolveSession(db: Db, token: string | undefined): Promise<SessionContext | null> {
  if (!token || token.length < 20) return null;
  const now = new Date();
  const [row] = await db
    .select({ session: sessions, identity: userIdentities })
    .from(sessions)
    .innerJoin(userIdentities, eq(sessions.identityId, userIdentities.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)));
  if (!row || row.identity.disabledAt || row.identity.deletedAt) return null;

  // Sliding activity marker, written at most every 10 minutes.
  if (now.getTime() - row.session.lastSeenAt.getTime() > 10 * 60 * 1000) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id));
  }
  const [roles, [profile]] = await Promise.all([
    db.select({ role: adminRoles.role }).from(adminRoles).where(eq(adminRoles.identityId, row.identity.id)),
    db.select({ id: candidateProfiles.id, done: candidateProfiles.onboardingCompletedAt }).from(candidateProfiles).where(eq(candidateProfiles.identityId, row.identity.id)),
  ]);
  return { sessionId: row.session.id, identity: row.identity, roles: roles.map((r) => r.role), profileId: profile?.id ?? null, onboarded: Boolean(profile?.done) };
}

export async function revokeSession(db: Db, token: string | undefined) {
  if (!token) return;
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)));
}
