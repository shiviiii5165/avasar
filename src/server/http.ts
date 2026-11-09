import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

/**
 * Constant-time secret check on BYTES. Comparing string lengths first is not enough: a value with a
 * non-ASCII character can match in string length but not in UTF-8 length, and timingSafeEqual then throws.
 */
export function secretMatches(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

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
