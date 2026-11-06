import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-level guard (Next 16 "proxy", formerly middleware). Authorization itself is enforced in every
 * server component, action and route; this only adds defense in depth:
 *  - the development sign-in endpoint never answers in production.
 */
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && request.nextUrl.pathname.startsWith("/api/auth/dev")) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/auth/dev"] };
