import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { revokeSession, SESSION_COOKIE } from "@/server/auth/identity";
import { publicUrl } from "@/server/config";
import { getDb } from "@/server/db/client";
import { apiError, sameOrigin } from "@/server/http";

/** POST /api/auth/logout — revokes the Avsar session server-side and clears the cookie. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return apiError(403, "CSRF", "Cross-site request refused");
  const jar = await cookies();
  await revokeSession(await getDb(), jar.get(SESSION_COOKIE)?.value);
  const res = NextResponse.redirect(new URL("/?signed_out=1", publicUrl()), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
}
