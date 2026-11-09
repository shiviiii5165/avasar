import { NextResponse, type NextRequest } from "next/server";

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
  return NextResponse.next();
}

// Everything except static build assets (those are immutable and host-independent).
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)"] };
