import { NextResponse } from "next/server";

import { publicUrl } from "@/server/config";

/**
 * GET /api/auth/tathastu/start — the launch path AI Tathastu's dashboard opens for integrated apps
 * ({origin}/api/auth/tathastu/start). Avsar then runs its own flow (state + PKCE) from /api/auth/login.
 */
export function GET() {
  return NextResponse.redirect(new URL("/api/auth/login?returnTo=%2Fapp%2Fdiscover", publicUrl()));
}