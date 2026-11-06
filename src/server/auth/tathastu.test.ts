import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createMemoryDb, type Db } from "../db/client";
import type { TathastuConfig } from "../config";
import { completeFlow, pkceChallenge, safeReturnTo, SsoError, startFlow } from "./tathastu";

const cfg: TathastuConfig = {
  issuer: "https://idp.test",
  authorizeUrl: "https://idp.test/integrations/authorize",
  tokenUrl: "https://idp.test/api/integrations/sso/token",
  jwksUrl: "https://idp.test/api/integrations/jwks",
  profileUrl: "https://idp.test/api/integrations/v1/profile",
  clientId: "avsar",
  clientSecret: "test-only-secret",
  redirectUri: "https://avsar.test/api/auth/callback",
  scopes: "openid profile email",
};

let db: Db;
let privateKey: CryptoKey;
let jwks: { keys: object[] };

beforeAll(async () => {
  db = await createMemoryDb();
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256", use: "sig" }] };
});
afterEach(() => vi.unstubAllGlobals());

async function token(claims: Record<string, unknown>, { aud = "avsar", iss = "https://idp.test", exp = "5m" } = {}) {
  return new SignJWT(claims).setProtectedHeader({ alg: "ES256", kid: "k1" }).setIssuer(iss).setAudience(aud).setSubject("ait-user-1").setIssuedAt().setExpirationTime(exp).sign(privateKey);
}

/** Provider stand-in: JWKS + token endpoint that checks the PKCE verifier against the challenge. */
function provider(idToken: () => Promise<string>, challenge: { value?: string }, status = 200) {
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === cfg.jwksUrl) return new Response(JSON.stringify(jwks), { headers: { "content-type": "application/json" } });
    if (url === cfg.tokenUrl) {
      if (status >= 500) return new Response("down", { status });
      const body = new URLSearchParams(String(init?.body));
      if (pkceChallenge(body.get("code_verifier")!) !== challenge.value) return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      if (body.get("redirect_uri") !== cfg.redirectUri) return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      return new Response(JSON.stringify({ id_token: await idToken(), token_type: "Bearer" }), { headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchImpl);
  return fetchImpl as unknown as typeof fetch;
}

async function begin(returnTo = "/app/saved") {
  const url = new URL(await startFlow(db, cfg, returnTo));
  return { state: url.searchParams.get("state")!, nonce: url.searchParams.get("nonce")!, challenge: url.searchParams.get("code_challenge")!, url };
}

describe("AI Tathastu SSO adapter", () => {
  it("builds a PKCE S256 authorization request with exact redirect URI", async () => {
    const { url } = await begin();
    expect(url.origin + url.pathname).toBe(cfg.authorizeUrl);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(url.searchParams.get("client_id")).toBe("avsar");
  });

  it("completes with a verified identity, and the state cannot be replayed", async () => {
    const f = await begin();
    const fetchImpl = provider(() => token({ nonce: f.nonce, email: "s@example.invalid", email_verified: true, name: "Student" }), { value: f.challenge });
    const res = await completeFlow(db, cfg, { code: "abc", state: f.state, error: null }, fetchImpl);
    expect(res.identity).toEqual({ provider: "ai_tathastu", subject: "ait-user-1", email: "s@example.invalid", emailVerified: true, name: "Student" });
    expect(res.returnTo).toBe("/app/saved");
    await expect(completeFlow(db, cfg, { code: "abc", state: f.state, error: null }, fetchImpl)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("rejects wrong audience, wrong issuer, expired tokens and nonce mismatch", async () => {
    for (const make of [
      (n: string) => token({ nonce: n }, { aud: "collaborate" }),
      (n: string) => token({ nonce: n }, { iss: "https://evil.test" }),
      (n: string) => token({ nonce: n }, { exp: "-1m" }),
      () => token({ nonce: "different" }),
    ]) {
      const f = await begin();
      const fetchImpl = provider(() => make(f.nonce), { value: f.challenge });
      await expect(completeFlow(db, cfg, { code: "abc", state: f.state, error: null }, fetchImpl)).rejects.toMatchObject({ code: "token_invalid" });
    }
  });

  it("reports provider outages honestly (no insecure fallback)", async () => {
    const f = await begin();
    const fetchImpl = provider(() => token({ nonce: f.nonce }), { value: f.challenge }, 503);
    const err = await completeFlow(db, cfg, { code: "abc", state: f.state, error: null }, fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(SsoError);
    expect(err.code).toBe("provider_unavailable");
  });

  it("rejects unknown state and provider errors", async () => {
    await expect(completeFlow(db, cfg, { code: "x", state: "made-up", error: null })).rejects.toMatchObject({ code: "invalid_state" });
    await expect(completeFlow(db, cfg, { code: null, state: null, error: "access_denied" })).rejects.toMatchObject({ code: "provider_error" });
  });

  it("only allows same-site relative return paths", () => {
    expect(safeReturnTo("/app/applications")).toBe("/app/applications");
    expect(safeReturnTo("https://evil.test")).toBe("/app");
    expect(safeReturnTo("//evil.test")).toBe("/app");
    expect(safeReturnTo("/\\evil.test")).toBe("/app");
  });
});
