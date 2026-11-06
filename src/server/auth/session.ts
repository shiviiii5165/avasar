import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getDb } from "../db/client";
import { can, type Permission } from "../domain/permissions";
import { resolveSession, SESSION_COOKIE, type SessionContext } from "./identity";

/** The current session (memoized per request). Null when signed out. */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(await getDb(), token);
});

export async function requireUser(returnTo = "/app"): Promise<SessionContext> {
  const s = await getSession();
  if (!s) redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  return s;
}

/**
 * Candidate area: signed in. The Avsar profile is created at sign-in; for older sessions without one it's
 * created here. There is no onboarding gate: an empty profile never blocks anything.
 */
export async function requireCandidate(returnTo = "/app"): Promise<SessionContext & { profileId: string }> {
  const s = await requireUser(returnTo);
  if (s.profileId) return s as SessionContext & { profileId: string };
  const { ensureProfile } = await import("../services/profiles");
  const profile = await ensureProfile(await getDb(), s.identity.id, s.identity.name);
  return { ...s, profileId: profile.id };
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
  }
}

/** Backend authorization for Admin Studio. Throws (never just hides UI). */
export async function requirePermission(permission: Permission): Promise<SessionContext> {
  const s = await requireUser("/admin");
  if (!can(s.roles, permission)) throw new ForbiddenError(permission);
  return s;
}

export const sessionCookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires,
});
