/**
 * Session cookie settings, shared by the server (sign-in, sign-out) and the edge proxy (which only renews the
 * cookie's expiry; it never reads or trusts the session itself). No server-only imports, so the proxy can use it.
 *
 * Sessions slide: a session used within SESSION_TTL_MS stays valid, up to SESSION_MAX_MS after sign-in. Then the
 * student signs in again. Validity is always decided by the database row (identity.ts resolveSession).
 */
export const SESSION_COOKIE = "avsar_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;

export const sessionCookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires,
});
