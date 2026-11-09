import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createSession, revokeSession, SESSION_COOKIE, upsertIdentity } from "@/server/auth/identity";
import { sessionCookieOptions } from "@/server/auth/session";
import { completeFlow, SsoError, STATE_COOKIE } from "@/server/auth/tathastu";
import { audit } from "@/server/audit";
import { publicUrl, tathastuConfig } from "@/server/config";
import { getDb } from "@/server/db/client";
import { log } from "@/server/log";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { applyTathastuProfile, fetchTathastuProfile, recordSyncFailure } from "@/server/services/profile-sync";
import { ensureProfile } from "@/server/services/profiles";

/**
 * GET /api/auth/tathastu/callback (and /api/auth/callback) — the redirect URI registered with AI Tathastu.
 * 1. Verify the flow: state matches this browser's cookie, single use, unexpired; then exchange the code
 *    server-side (PKCE) and verify the access token (signature, issuer, audience, expiry, scope).
 * 2. Find or create the Avsar identity by provider subject (never by email) and the Avsar profile.
 * 3. Import the profile the student shares with Avsar, using the access token once. A failed import never
 *    blocks sign-in: it's recorded and the profile page shows a retry.
 * 4. Replace any previous Avsar session (no session fixation) and return to the page the student was on.
 */
export async function GET(request: Request) {
  const { config } = tathastuConfig();
  const done = (res: NextResponse) => {
    res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", expires: new Date(0) });
    return res;
  };
  const fail = (code: string) => done(NextResponse.redirect(new URL(`/sign-in?error=${code}`, publicUrl())));
  if (!config) return fail("sso_not_configured");

  const params = new URL(request.url).searchParams;
  const jar = await cookies();
  const db = await getDb();
  if (!(await rateLimit(db, "callback", `ip:${clientIp(request.headers)}`)).ok) return fail("rate_limited");
  try {
    const { identity, returnTo, accessToken } = await completeFlow(db, config, {
      code: params.get("code"),
      state: params.get("state"),
      error: params.get("error"),
      browserState: jar.get(STATE_COOKIE)?.value ?? null,
    });
    const row = await upsertIdentity(db, identity);
    const profile = await ensureProfile(db, row.id, identity.name);
    try {
      const raw = await fetchTathastuProfile(config.profileUrl, accessToken);
      await applyTathastuProfile(db, profile.id, raw, identity.subject, row.id, config.clientId);
    } catch (err) {
      await recordSyncFailure(db, profile.id, err instanceof Error ? err.message : "Profile import failed");
      log("warn", "auth.profile_import_failed", { identityId: row.id, code: (err as { code?: string }).code ?? "unknown" });
    }
    await revokeSession(db, jar.get(SESSION_COOKIE)?.value); // a previous session on this browser is ended
    const session = await createSession(db, row.id);
    await audit(db, { actorId: row.id, actorRole: "candidate", action: "auth.sign_in", targetType: "identity", targetId: row.id, metadata: { provider: "ai_tathastu" } });
    const res = NextResponse.redirect(new URL(returnTo, publicUrl()));
    res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return done(res);
  } catch (err) {
    if (err instanceof SsoError) {
      log("warn", "auth.callback_failed", { code: err.code });
      // A silent refresh (prompt=none) that needs the student: send them to reconnect from their profile.
      if (err.code === "login_required" || err.code === "consent_required") return done(NextResponse.redirect(new URL(`/app/profile?sync=${err.code}`, publicUrl())));
      return fail(err.code);
    }
    if (err instanceof Error && err.message === "ACCOUNT_DISABLED") return fail("account_disabled");
    log("error", "auth.callback_error", { message: err instanceof Error ? err.message : "unknown" });
    return fail("unavailable");
  }
}
