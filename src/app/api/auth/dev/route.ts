import { NextResponse } from "next/server";

import { createSession, SESSION_COOKIE, upsertIdentity } from "@/server/auth/identity";
import { sessionCookieOptions } from "@/server/auth/session";
import { safeReturnTo } from "@/server/auth/tathastu";
import { audit } from "@/server/audit";
import { devAuthEnabled, publicUrl } from "@/server/config";
import { getDb } from "@/server/db/client";
import { adminRoles } from "@/server/db/schema";
import { ensureProfile } from "@/server/services/profiles";
import { apiError, sameOrigin } from "@/server/http";

/**
 * DEVELOPMENT ONLY sign-in for synthetic personas, so the product can be exercised before AI Tathastu
 * registers Avsar's OAuth client. Disabled unless AVSAR_DEV_AUTH=1, and always disabled in production.
 * Identities are created with provider "dev" and can never collide with real AI Tathastu subjects.
 */
const PERSONAS = {
  candidate: { subject: "dev-candidate", name: "Asha Rao (dev)", email: "asha.dev@example.invalid", roles: [] },
  admin: { subject: "dev-admin", name: "Avsar Ops (dev)", email: "ops.dev@example.invalid", roles: ["platform_admin"] },
  moderator: { subject: "dev-moderator", name: "Moderator (dev)", email: "mod.dev@example.invalid", roles: ["moderator"] },
} as const;

export async function POST(request: Request) {
  if (!devAuthEnabled()) return apiError(404, "NOT_FOUND", "Not found");
  if (!sameOrigin(request)) return apiError(403, "CSRF", "Cross-site request refused");
  const form = await request.formData();
  const key = String(form.get("persona") ?? "candidate") as keyof typeof PERSONAS;
  const persona = PERSONAS[key] ?? PERSONAS.candidate;
  const db = await getDb();
  const row = await upsertIdentity(db, { provider: "dev", subject: persona.subject, email: persona.email, emailVerified: true, name: persona.name });
  await ensureProfile(db, row.id, persona.name); // same as the real callback: no onboarding step
  for (const role of persona.roles) await db.insert(adminRoles).values({ identityId: row.id, role }).onConflictDoNothing();
  const session = await createSession(db, row.id);
  await audit(db, { actorId: row.id, actorRole: "candidate", action: "auth.dev_sign_in", targetType: "identity", targetId: row.id, metadata: { persona: key } });
  const fallback = persona.roles.length ? "/admin" : "/app/discover";
  const returnTo = safeReturnTo(String(form.get("returnTo") ?? "") || fallback);
  const res = NextResponse.redirect(new URL(returnTo, publicUrl()), { status: 303 });
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  return res;
}
