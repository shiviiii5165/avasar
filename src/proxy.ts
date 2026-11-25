import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_TTL_MS, sessionCookieOptions } from "./server/auth/cookie";
import { RETURN_PATH_HEADER, requestPathOf } from "./server/auth/return-path";
import { CSP_NONCE_HEADER, cspMode, newNonce, strictCsp } from "./server/csp";

/**
 * Edge-level guard (Next 16 "proxy", formerly middleware). Authorization itself is enforced in every
 * server component, action and route; this only adds defense in depth:
 *  - the development sign-in endpoint never answers in production;
 *  - production serves ONE canonical host (AVSAR_PUBLIC_URL, e.g. https://avasar.aitathastu.com). Requests to any
 *    other host (e.g. avasar-orcin.vercel.app) get a permanent redirect, so sign-in always starts and finishes on the
 *    same domain (the state and session cookies are host-only). Health endpoints answer on every host for monitoring.
 */
export function canonicalRedirect(requestUrl: string, host: string | null, publicUrl: string | undefined): string | null {
  if (!publicUrl || !host) return null;
  let canonical: URL;
  try {
    canonical = new URL(publicUrl);
  } catch {
    return null;
  }
  if (host.toLowerCase() === canonical.host.toLowerCase()) return null;
  const url = new URL(requestUrl);
  if (url.pathname.startsWith("/api/health")) return null;
  // Vercel Cron calls the deployment host; the route authenticates every call with CRON_SECRET itself.
  if (url.pathname.startsWith("/api/cron/")) return null;
  return `${canonical.origin}${url.pathname}${url.search}`;
}

export function proxy(request: NextRequest) {
  const production = process.env.NODE_ENV === "production";
  if (production && request.nextUrl.pathname.startsWith("/api/auth/dev")) {
    return new NextResponse(null, { status: 404 });
  }
  // Vercel preview deployments stay on their own URL so they can be reviewed (they never share sessions with production).
  if (production && process.env.VERCEL_ENV !== "preview") {
    const target = canonicalRedirect(request.url, request.headers.get("host"), process.env.AVSAR_PUBLIC_URL);
    if (target) return NextResponse.redirect(target, 308);
  }
  // Record the requested path for sign-in return (overwrites any client-supplied value).
  const headers = new Headers(request.headers);
  headers.set(RETURN_PATH_HEADER, requestPathOf(request.nextUrl));
  // Strict nonce CSP (see server/csp.ts). Client-supplied values are overwritten. Enforced on preview deployments
  // and wherever AVSAR_CSP_MODE=enforce; report-only otherwise (production until the owner switches it).
  const nonce = newNonce();
  const csp = strictCsp(nonce, { dev: !production, formAction: process.env.AVSAR_AIT_BASE_URL?.trim() });
  const mode = cspMode(process.env);
  headers.set(CSP_NONCE_HEADER, nonce);
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");
  headers.set(mode === "enforce" ? "content-security-policy" : "content-security-policy-report-only", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set(mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", csp);
  // Sliding session: on page loads, renew the cookie's expiry so an active student isn't signed out after a fixed
  // week. The value is passed through unchanged and never trusted here; the database decides if it's still valid
  // (and caps the lifetime). Sign-in, sign-out and other API routes set or clear the cookie themselves.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && request.method === "GET" && !request.nextUrl.pathname.startsWith("/api/")) {
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(new Date(Date.now() + SESSION_TTL_MS)));
  }
  return res;
}

// Everything except static build assets (those are immutable and host-independent).
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)"] };
