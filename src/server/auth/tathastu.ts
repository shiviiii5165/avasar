import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

import type { TathastuConfig } from "../config";
import type { Db } from "../db/client";
import { oauthFlows } from "../db/schema";
import { randomToken, type VerifiedIdentity } from "./identity";

/**
 * AI Tathastu SSO adapter: OAuth 2.0 Authorization Code + PKCE S256 with Avsar's OWN client.
 *
 * Contract (verified against AI Tathastu's source, src/lib/integrations/*):
 *  - GET  {base}/integrations/authorize?client_id&redirect_uri&state&code_challenge&code_challenge_method=S256[&prompt=none|consent]
 *    redirect_uri must exactly match a registered URI (default when none registered: {origin}/api/auth/tathastu/callback,
 *    no query string). PKCE is required. Errors come back as ?error=…&error_description=…&state=…
 *    (access_denied, login_required, consent_required, invalid_request, temporarily_unavailable).
 *  - POST {base}/api/integrations/sso/token (form: grant_type=authorization_code, code, redirect_uri, code_verifier,
 *    client_id, client_secret). Codes live 60 s and are single use. Returns { access_token, token_type, expires_in,
 *    scope: "profile:read", user }. There is NO id_token and NO nonce in this contract.
 *  - The access token is an ES256 JWT (kid in header) from {base}/api/integrations/jwks with
 *    iss=https://www.aitathastu.com, aud=<client id>, sub=<user id>, iat, exp (15 min), jti, scope=profile:read, email, name, sv.
 *
 * Avsar's checks: state is random, single use, 10-minute expiry AND bound to the browser that started the flow
 * (login-CSRF protection); PKCE S256; exact redirect URI; token signature (ES256 only), issuer, audience, expiry,
 * required claims and scope. The token is used once server-side and never stored, logged or sent to the browser.
 */
const FLOW_TTL_MS = 10 * 60 * 1000;
export const STATE_COOKIE = "avsar_oauth_state";
export const TOKEN_SCOPE = "profile:read";

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** Only same-site relative paths may be used as post-login destinations (no open redirects). */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/app";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return "/app";
  try {
    // Must stay on our origin after URL parsing (catches "/%2F%2Fevil.com" style tricks).
    const u = new URL(raw, "https://avsar.invalid");
    if (u.origin !== "https://avsar.invalid") return "/app";
    return `${u.pathname}${u.search}`.slice(0, 300);
  } catch {
    return "/app";
  }
}

/**
 * Starts a sign-in. Returns the provider URL and the state, which the caller stores in an HttpOnly cookie
 * so the callback can prove it's the same browser. `prompt: "none"` = silent refresh; "consent" = reconnect.
 */
export async function startFlow(db: Db, cfg: TathastuConfig, returnTo: string, opts: { prompt?: "none" | "consent" } = {}): Promise<{ url: string; state: string }> {
  const state = randomToken();
  const codeVerifier = randomToken(48); // 64 base64url chars: within PKCE's 43-128
  await db.insert(oauthFlows).values({ state, codeVerifier, nonce: randomToken(), returnTo: safeReturnTo(returnTo), expiresAt: new Date(Date.now() + FLOW_TTL_MS) });
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  if (opts.prompt) url.searchParams.set("prompt", opts.prompt);
  return { url: url.toString(), state };
}

export type SsoErrorCode =
  | "invalid_state" | "browser_mismatch" | "access_denied" | "login_required" | "consent_required" | "invalid_grant"
  | "provider_error" | "token_invalid" | "provider_unavailable" | "client_misconfigured";

export class SsoError extends Error {
  constructor(public readonly code: SsoErrorCode, message?: string) {
    super(message ?? code);
  }
}

/** Claims the flow exactly once. A replayed or expired state fails. */
async function consumeFlow(db: Db, state: string) {
  const [flow] = await db
    .update(oauthFlows)
    .set({ usedAt: new Date() })
    .where(and(eq(oauthFlows.state, state), isNull(oauthFlows.usedAt), gt(oauthFlows.expiresAt, new Date())))
    .returning();
  if (!flow) throw new SsoError("invalid_state");
  return flow;
}

const sameString = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Remote JWKS per URL. jose caches keys (10 min) and refetches when a token names an unknown kid (at most every
 * 30 s), which covers AI Tathastu's key rotation (it keeps retired keys published during a rotation).
 */
const jwksCache = new Map<string, JWTVerifyGetKey>();
function jwksFor(url: string): JWTVerifyGetKey {
  let set = jwksCache.get(url);
  if (!set) {
    set = createRemoteJWKSet(new URL(url), { cacheMaxAge: 10 * 60_000, cooldownDuration: 30_000, timeoutDuration: 5000 });
    jwksCache.set(url, set);
  }
  return set;
}
/** Tests only. */
export const resetJwksCache = () => jwksCache.clear();

/** Verifies an AI Tathastu access token exactly as the contract defines it. */
export async function verifyAccessToken(cfg: TathastuConfig, jwt: string, getKey: JWTVerifyGetKey = jwksFor(cfg.jwksUrl)): Promise<JWTPayload & { sub: string }> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(jwt, getKey, { issuer: cfg.issuer, audience: cfg.clientId, algorithms: ["ES256"], requiredClaims: ["exp", "iat", "sub"], clockTolerance: 30 }));
  } catch (err) {
    throw new SsoError("token_invalid", err instanceof Error ? err.message : "verification failed");
  }
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (aud.length !== 1) throw new SsoError("token_invalid", "token must have exactly one audience");
  if (payload.scope !== TOKEN_SCOPE) throw new SsoError("token_invalid", "unexpected token scope");
  if (typeof payload.sub !== "string" || !payload.sub) throw new SsoError("token_invalid", "no subject");
  return payload as JWTPayload & { sub: string };
}

const PROVIDER_ERRORS: Record<string, SsoErrorCode> = {
  access_denied: "access_denied",
  login_required: "login_required",
  consent_required: "consent_required",
  temporarily_unavailable: "provider_unavailable",
  server_error: "provider_unavailable",
};

export async function completeFlow(
  db: Db,
  cfg: TathastuConfig,
  params: { code: string | null; state: string | null; error: string | null; browserState?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<{ identity: VerifiedIdentity; returnTo: string; accessToken: string }> {
  // The state must come back to the same browser that started the flow (cookie set at /api/auth/login).
  if (!params.state || !params.browserState || !sameString(params.state, params.browserState)) {
    // Consume a known state anyway so it can't be replayed from another browser.
    if (params.state) await consumeFlow(db, params.state).catch(() => undefined);
    throw new SsoError(params.state ? "browser_mismatch" : "invalid_state");
  }
  const flow = await consumeFlow(db, params.state);
  if (params.error) throw new SsoError(PROVIDER_ERRORS[params.error] ?? "provider_error", params.error);
  if (!params.code) throw new SsoError("invalid_state");

  let res: Response;
  try {
    res = await fetchImpl(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: params.code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret, code_verifier: flow.codeVerifier }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new SsoError("provider_unavailable");
  }
  const body = (await res.json().catch(() => null)) as { access_token?: unknown; error?: string } | null;
  if (res.status === 429 || res.status >= 500) throw new SsoError("provider_unavailable", `token endpoint ${res.status}`);
  if (res.status === 401 || body?.error === "invalid_client" || body?.error === "unauthorized_client") throw new SsoError("client_misconfigured", `token endpoint ${res.status} ${body?.error ?? ""}`);
  if (body?.error === "invalid_grant") throw new SsoError("invalid_grant");
  if (!res.ok || !body || typeof body.access_token !== "string") throw new SsoError("token_invalid", `token endpoint ${res.status}`);

  const payload = await verifyAccessToken(cfg, body.access_token);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    identity: { provider: "ai_tathastu", subject: payload.sub, email: str(payload.email), emailVerified: false, name: str(payload.name) },
    returnTo: flow.returnTo,
    // Used once by the callback to read the profile, then discarded (never stored, logged or sent to the browser).
    accessToken: body.access_token,
  };
}
