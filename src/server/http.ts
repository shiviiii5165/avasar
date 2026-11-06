import "server-only";

import { NextResponse } from "next/server";

/**
 * CSRF guard for cookie-authenticated state-changing route handlers: the request must come from our own
 * origin. (Server Actions get the same check from Next.js.) SameSite=Lax cookies are the second layer.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Consistent JSON error shape for every API: { error: { code, message } }. */
export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}
