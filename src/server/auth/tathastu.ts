import "server-only";

import { createHash } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import type { TathastuConfig } from "../config";
import type { Db } from "../db/client";
import { oauthFlows } from "../db/schema";
import { randomToken, type VerifiedIdentity } from "./identity";

/**
 * AI Tathastu SSO adapter (Authorization Code + PKCE S256), using Avsar's OWN client registration.
 * The endpoints follow the contract AI Tathastu documents for integrated apps; Avsar does not assume
 * they are live until a real client is registered (docs/DECISIONS.md D-04). Every check is
 * server-side: state (single use, 10-minute expiry), PKCE, exact redirect URI, ID-token signature
 * via JWKS (rotation handled by jose's remote set), issuer, audience, expiry and nonce.
 */
const FLOW_TTL_MS = 10 * 60 * 1000;

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** Only same-site relative paths may be used as post-login destinations (no open redirects). */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/app";
  return raw.slice(0, 300);
}

export async function startFlow(db: Db, cfg: TathastuConfig, returnTo: string): Promise<string> {
  const state = randomToken();
  const codeVerifier = randomToken(48);
  const nonce = randomToken();
  await db.insert(oauthFlows).values({ state, codeVerifier, nonce, returnTo: safeReturnTo(returnTo), expiresAt: new Date(Date.now() + FLOW_TTL_MS) });
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", cfg.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export class SsoError extends Error {
  constructor(public readonly code: "invalid_state" | "provider_error" | "token_invalid" | "provider_unavailable", message?: string) {
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

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function completeFlow(db: Db, cfg: TathastuConfig, params: { code: string | null; state: string | null; error: string | null }, fetchImpl: typeof fetch = fetch): Promise<{ identity: VerifiedIdentity; returnTo: string }> {
  if (params.error) throw new SsoError("provider_error", params.error);
  if (!params.state || !params.code) throw new SsoError("invalid_state");
  const flow = await consumeFlow(db, params.state);

  let res: Response;
  try {
    res = await fetchImpl(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: cfg.redirectUri,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code_verifier: flow.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SsoError("provider_unavailable");
  }
  if (res.status >= 500) throw new SsoError("provider_unavailable");
  const body = (await res.json().catch(() => null)) as { id_token?: string; access_token?: string } | null;
  if (!res.ok || !body) throw new SsoError("token_invalid", `token endpoint returned ${res.status}`);
  const jwt = body.id_token ?? body.access_token;
  if (!jwt) throw new SsoError("token_invalid", "no token in response");

  let payload: JWTPayload;
  try {
    const jwks = jwksCache.get(cfg.jwksUrl) ?? createRemoteJWKSet(new URL(cfg.jwksUrl));
    jwksCache.set(cfg.jwksUrl, jwks);
    ({ payload } = await jwtVerify(jwt, jwks, { issuer: cfg.issuer, audience: cfg.clientId, algorithms: ["ES256", "RS256"], clockTolerance: 30 }));
  } catch (err) {
    throw new SsoError("token_invalid", err instanceof Error ? err.message : "verification failed");
  }
  if (payload.nonce !== undefined && payload.nonce !== flow.nonce) throw new SsoError("token_invalid", "nonce mismatch");
  if (!payload.sub) throw new SsoError("token_invalid", "no subject");

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    identity: {
      provider: "ai_tathastu",
      subject: payload.sub,
      email: str(payload.email),
      emailVerified: payload.email_verified === true,
      name: str(payload.name),
    },
    returnTo: flow.returnTo,
  };
}
