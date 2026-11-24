import { NextResponse, type NextRequest } from "next/server";

import { RETURN_PATH_HEADER, requestPathOf } from "./server/auth/return-path";
import { CSP_NONCE_HEADER, newNonce, strictCsp } from "./server/csp";

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
  if (production) {
    const target = canonicalRedirect(request.url, request.headers.get("host"), process.env.AVSAR_PUBLIC_URL);
    if (target) return NextResponse.redirect(target, 308);
  }
  // Record the requested path for sign-in return (overwrites any client-supplied value).
  const headers = new Headers(request.headers);
  headers.set(RETURN_PATH_HEADER, requestPathOf(request.nextUrl));
  // Strict nonce CSP in report-only mode (see server/csp.ts). Client-supplied values are overwritten.
  const nonce = newNonce();
  const csp = strictCsp(nonce, { dev: !production, formAction: process.env.AVSAR_AIT_BASE_URL?.trim() });
  headers.set(CSP_NONCE_HEADER, nonce);
  headers.delete("content-security-policy");
  headers.set("content-security-policy-report-only", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy-Report-Only", csp);
  return res;
}

// Everything except static build assets (those are immutable and host-independent).
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)"] };
