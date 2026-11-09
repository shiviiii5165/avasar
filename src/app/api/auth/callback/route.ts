import { NextResponse } from "next/server";

import { createSession, SESSION_COOKIE, upsertIdentity } from "@/server/auth/identity";
import { sessionCookieOptions } from "@/server/auth/session";
import { completeFlow, SsoError } from "@/server/auth/tathastu";
import { audit } from "@/server/audit";
import { publicUrl, tathastuConfig } from "@/server/config";
import { getDb } from "@/server/db/client";
import { applyTathastuProfile, fetchTathastuProfile, recordSyncFailure } from "@/server/services/profile-sync";
import { ensureProfile } from "@/server/services/profiles";
import { clientIp, rateLimit } from "@/server/rate-limit";

/**
 * GET /api/auth/callback — the redirect URI registered with AI Tathastu for Avsar's own client.
 * 1. Verify the flow and the token (state, PKCE, signature, issuer, audience, expiry).
 * 2. Find or create the Avsar identity by stable subject and an Avsar profile (no onboarding).
 * 3. Import the profile the student shares with Avsar, using the short-lived access token once.
 *    A failed import never blocks sign-in; it's recorded and shown on the profile page.
 * 4. Return to the page the student was on.
 */
export async function GET(request: Request) {
  const { config } = tathastuConfig();
  const fail = (code: string) => NextResponse.redirect(new URL(`/sign-in?error=${code}`, publicUrl()));
  if (!config) return fail("sso_not_configured");

  const params = new URL(request.url).searchParams;
  const db = await getDb();
  if (!(await rateLimit(db, "callback", `ip:${clientIp(request.headers)}`)).ok) return fail("rate_limited");
  try {
    const { identity, returnTo, accessToken } = await completeFlow(db, config, { code: params.get("code"), state: params.get("state"), error: params.get("error") });
    const row = await upsertIdentity(db, identity);
    const profile = await ensureProfile(db, row.id, identity.name);
    try {
      const raw = await fetchTathastuProfile(config.profileUrl, accessToken);
      await applyTathastuProfile(db, profile.id, raw, identity.subject, row.id);
    } catch (err) {
      await recordSyncFailure(db, profile.id, err instanceof Error ? err.message : "Profile import failed");
    }
    const session = await createSession(db, row.id);
    await audit(db, { actorId: row.id, actorRole: "candidate", action: "auth.sign_in", targetType: "identity", targetId: row.id, metadata: { provider: "ai_tathastu" } });
    const res = NextResponse.redirect(new URL(returnTo, publicUrl()));
    res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return res;
  } catch (err) {
    if (err instanceof SsoError) {
      // A silent refresh (prompt=none) that needs the student: send them to reconnect from their profile.
      if (err.code === "login_required" || err.code === "consent_required") return NextResponse.redirect(new URL(`/app/profile?sync=${err.code}`, publicUrl()));
      return fail(err.code);
    }
    if (err instanceof Error && err.message === "ACCOUNT_DISABLED") return fail("account_disabled");
    console.error("[auth] callback failed:", err instanceof Error ? err.message : err);
    return fail("unavailable");
  }
}
