import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { audit } from "../audit";
import { bootstrapSuperAdmins } from "../config";
import type { Db } from "../db/client";
import { adminRoles, candidateProfiles, sessions, userIdentities } from "../db/schema";
import type { AdminRole } from "../domain/permissions";

import { SESSION_COOKIE, SESSION_MAX_MS, SESSION_TTL_MS } from "./cookie";

export { SESSION_COOKIE, SESSION_TTL_MS };

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
}

/**
 * Resolves a session cookie in ONE database round trip: session, identity, admin roles and profile id together.
 * It runs on every signed-in request, so each extra sequential query adds a full database round trip to
 * every page. The checks are unchanged: token hash, not revoked, not expired, identity not disabled or deleted.
 */
export async function resolveSession(db: Db, token: string | undefined): Promise<SessionContext | null> {
  if (!token || token.length < 20) return null;
  const now = new Date();
  const [row] = await db
    .select({
      session: sessions,
      identity: userIdentities,
      profileId: candidateProfiles.id,
      roles: sql<string[]>`coalesce((select array_agg(${adminRoles.role}::text) from ${adminRoles} where ${adminRoles.identityId} = ${userIdentities.id}), '{}'::text[])`,
    })
    .from(sessions)
    .innerJoin(userIdentities, eq(sessions.identityId, userIdentities.id))
    .leftJoin(candidateProfiles, eq(candidateProfiles.identityId, userIdentities.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)));
  if (!row || row.identity.disabledAt || row.identity.deletedAt) return null;

  // Sliding session, written at most every 10 minutes: activity extends it by SESSION_TTL_MS, never beyond
  // SESSION_MAX_MS after sign-in (then the student signs in again). The proxy renews the cookie to match.
  if (now.getTime() - row.session.lastSeenAt.getTime() > 10 * 60 * 1000) {
    const expiresAt = new Date(Math.min(now.getTime() + SESSION_TTL_MS, row.session.createdAt.getTime() + SESSION_MAX_MS));
    await db.update(sessions).set({ lastSeenAt: now, expiresAt: expiresAt > row.session.expiresAt ? expiresAt : row.session.expiresAt }).where(eq(sessions.id, row.session.id));
  }
  return { sessionId: row.session.id, identity: row.identity, roles: (row.roles ?? []) as AdminRole[], profileId: row.profileId ?? null };
}

export async function revokeSession(db: Db, token: string | undefined) {
  if (!token) return;
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)));
}
