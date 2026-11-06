import { NextResponse } from "next/server";

import { createSession, SESSION_COOKIE, upsertIdentity } from "@/server/auth/identity";
import { sessionCookieOptions } from "@/server/auth/session";
import { completeFlow, SsoError } from "@/server/auth/tathastu";
import { audit } from "@/server/audit";
import { publicUrl, tathastuConfig } from "@/server/config";
import { getDb } from "@/server/db/client";

/** GET /api/auth/callback — the redirect URI registered with AI Tathastu for Avsar's own client. */
export async function GET(request: Request) {
  const { config } = tathastuConfig();
  const fail = (code: string) => NextResponse.redirect(new URL(`/sign-in?error=${code}`, publicUrl()));
  if (!config) return fail("sso_not_configured");

  const params = new URL(request.url).searchParams;
  const db = await getDb();
  try {
    const { identity, returnTo } = await completeFlow(db, config, { code: params.get("code"), state: params.get("state"), error: params.get("error") });
    const row = await upsertIdentity(db, identity);
    const session = await createSession(db, row.id);
    await audit(db, { actorId: row.id, actorRole: "candidate", action: "auth.sign_in", targetType: "identity", targetId: row.id, metadata: { provider: "ai_tathastu" } });
    const res = NextResponse.redirect(new URL(returnTo, publicUrl()));
    res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return res;
  } catch (err) {
    if (err instanceof SsoError) return fail(err.code);
    if (err instanceof Error && err.message === "ACCOUNT_DISABLED") return fail("account_disabled");
    console.error("[auth] callback failed:", err instanceof Error ? err.message : err);
    return fail("unavailable");
  }
}
