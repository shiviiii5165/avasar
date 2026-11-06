import { NextResponse } from "next/server";

import { safeReturnTo, startFlow } from "@/server/auth/tathastu";
import { publicUrl, tathastuConfig } from "@/server/config";
import { getDb } from "@/server/db/client";

/** GET /api/auth/login?returnTo=/app → redirects to AI Tathastu's authorization page. */
export async function GET(request: Request) {
  const { config } = tathastuConfig();
  if (!config) {
    // Not configured: say so honestly. There is no insecure fallback.
    return NextResponse.redirect(new URL("/sign-in?error=sso_not_configured", publicUrl()));
  }
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  try {
    return NextResponse.redirect(await startFlow(await getDb(), config, returnTo));
  } catch (err) {
    console.error("[auth] could not start sign-in:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(new URL("/sign-in?error=unavailable", publicUrl()));
  }
}
