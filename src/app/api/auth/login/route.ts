import { NextResponse } from "next/server";

import { safeReturnTo, startFlow } from "@/server/auth/tathastu";
import { publicUrl, tathastuConfig } from "@/server/config";
import { getDb } from "@/server/db/client";
import { clientIp, rateLimit } from "@/server/rate-limit";

/**
 * GET /api/auth/login?returnTo=/path[&prompt=none|consent]
 *  - default: Continue with AI Tathastu (shows its sign-in/consent only if needed)
 *  - prompt=none: silent profile refresh for a linked student
 *  - prompt=consent: reconnect / change what's shared
 */
export async function GET(request: Request) {
  const { config } = tathastuConfig();
  if (!config) return NextResponse.redirect(new URL("/sign-in?error=sso_not_configured", publicUrl()));
  const sp = new URL(request.url).searchParams;
  const returnTo = safeReturnTo(sp.get("returnTo"));
  const prompt = sp.get("prompt") === "none" ? "none" : sp.get("prompt") === "consent" ? "consent" : undefined;
  const db = await getDb();
  if (!(await rateLimit(db, "login", `ip:${clientIp(request.headers)}`)).ok) return NextResponse.redirect(new URL("/sign-in?error=rate_limited", publicUrl()));
  try {
    return NextResponse.redirect(await startFlow(db, config, returnTo, { prompt }));
  } catch (err) {
    console.error("[auth] could not start sign-in:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL("/sign-in?error=unavailable", publicUrl()));
  }
}
