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

/**
 * Content-Disposition for a user-supplied file name: an ASCII fallback plus the RFC 6266/5987 UTF-8 form, so
 * names in Hindi or any other script download correctly (a raw non-Latin-1 name makes the header throw), and
 * quotes, backslashes and control characters can never break out of the header.
 */
export function contentDisposition(type: "inline" | "attachment", name: string): string {
  const clean = name.replace(/[\u0000-\u001f\u007f"\\/]/g, "").trim().slice(0, 150) || "document";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
