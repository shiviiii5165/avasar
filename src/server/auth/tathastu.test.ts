import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryDb, type Db } from "../db/client";
import type { TathastuConfig } from "../config";
import { createSession, resolveSession, revokeSession, upsertIdentity } from "./identity";
import { completeFlow, pkceChallenge, resetJwksCache, safeReturnTo, SsoError, startFlow, verifyAccessToken } from "./tathastu";

/** Mirrors AI Tathastu's verified contract (src/lib/integrations/*). */
const cfg: TathastuConfig = {
  issuer: "https://www.aitathastu.com",
  authorizeUrl: "https://idp.test/integrations/authorize",
  tokenUrl: "https://idp.test/api/integrations/sso/token",
  jwksUrl: "https://idp.test/api/integrations/jwks",
  profileUrl: "https://idp.test/api/integrations/v1/profile",
  clientId: "avsar",
  clientSecret: "test-only-secret",
  redirectUri: "https://avsar.test/api/auth/tathastu/callback",
  scopes: "",
};

let db: Db;
type Key = { kid: string; privateKey: CryptoKey; jwk: object };
const keys: Key[] = [];
let published: Key[] = [];

async function newKey(kid: string): Promise<Key> {
  const pair = await generateKeyPair("ES256", { extractable: true });
  return { kid, privateKey: pair.privateKey, jwk: { ...(await exportJWK(pair.publicKey)), kid, alg: "ES256", use: "sig" } };
}

beforeAll(async () => {
  db = await createMemoryDb();
  keys.push(await newKey("k1"), await newKey("k2"));
});
beforeEach(() => { published = [keys[0]]; resetJwksCache(); });
afterEach(() => vi.unstubAllGlobals());

type Claims = { aud?: string | string[]; iss?: string; exp?: string; scope?: unknown; sub?: string; kid?: string; alg?: string; noIat?: boolean };
async function accessToken(c: Claims = {}) {
  const key = keys.find((k) => k.kid === (c.kid ?? "k1"))!;
  let jwt = new SignJWT({ email: "meera@example.invalid", name: "Meera", scope: c.scope === undefined ? "profile:read" : c.scope, sv: 0 })
    .setProtectedHeader({ alg: "ES256", kid: key.kid, typ: "JWT" })
    .setIssuer(c.iss ?? cfg.issuer)
    .setAudience(c.aud ?? "avsar")
    .setSubject(c.sub ?? "ait-user-1")
    .setExpirationTime(c.exp ?? "15m")
    .setJti(crypto.randomUUID());
  if (!c.noIat) jwt = jwt.setIssuedAt();
  return jwt.sign(key.privateKey);
}

/** Provider stand-in: JWKS + token endpoint enforcing single-use codes, PKCE and the exact redirect URI. */
function provider(opts: { token?: () => Promise<string>; status?: number; error?: string } = {}) {
  const issued = new Map<string, string>(); // code → challenge
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === cfg.jwksUrl) return Response.json({ keys: published.map((k) => k.jwk) });
    if (url === cfg.tokenUrl) {
      if (opts.status) return Response.json({ error: opts.error ?? "server_error" }, { status: opts.status });
      const body = new URLSearchParams(String(init?.body));
      if (body.get("client_secret") !== cfg.clientSecret) return Response.json({ error: "invalid_client" }, { status: 401 });
      const challenge = issued.get(body.get("code") ?? "");
      issued.delete(body.get("code") ?? ""); // single use
      if (!challenge || body.get("redirect_uri") !== cfg.redirectUri || pkceChallenge(body.get("code_verifier") ?? "") !== challenge) return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({ access_token: await (opts.token ?? accessToken)(), token_type: "Bearer", expires_in: 900, scope: "profile:read" });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchImpl);
  return { fetchImpl: fetchImpl as unknown as typeof fetch, issue: (challenge: string) => { const code = crypto.randomUUID(); issued.set(code, challenge); return code; } };
}

async function begin(returnTo = "/app/saved", prompt?: "none" | "consent") {
  const { url, state } = await startFlow(db, cfg, returnTo, { prompt });
  const u = new URL(url);
  return { state, challenge: u.searchParams.get("code_challenge")!, url: u };
}

describe("authorization request", () => {
  it("uses PKCE S256, the exact redirect URI, a random state, and no unused parameters", async () => {
    const a = await begin();
    const b = await begin();
    expect(a.url.origin + a.url.pathname).toBe(cfg.authorizeUrl);
    expect(a.url.searchParams.get("client_id")).toBe("avsar");
    expect(a.url.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(a.url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(a.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.state.length).toBeGreaterThanOrEqual(32);
    expect(a.state).not.toBe(b.state);
    expect(a.url.searchParams.has("nonce")).toBe(false); // the contract has no ID token / nonce
    expect(a.url.searchParams.has("scope")).toBe(false); // scopes are chosen by the student on AI Tathastu
  });
  it("passes prompt=none / consent through", async () => {
    expect((await begin("/app", "none")).url.searchParams.get("prompt")).toBe("none");
    expect((await begin("/app", "consent")).url.searchParams.get("prompt")).toBe("consent");
  });
});

describe("callback", () => {
  it("completes a valid login and never exposes the token beyond the server", async () => {
    const p = provider();
    const f = await begin("/app/saved");
    const out = await completeFlow(db, cfg, { code: p.issue(f.challenge), state: f.state, error: null, browserState: f.state }, p.fetchImpl);
    expect(out.identity).toMatchObject({ provider: "ai_tathastu", subject: "ait-user-1", name: "Meera", emailVerified: false });
    expect(out.returnTo).toBe("/app/saved");
    expect(out.accessToken).toMatch(/^eyJ/);
  });
  it("rejects a state that doesn't match this browser (login CSRF) and burns it", async () => {
    const p = provider();
    const f = await begin();
    await expect(completeFlow(db, cfg, { code: p.issue(f.challenge), state: f.state, error: null, browserState: "other-browser" }, p.fetchImpl)).rejects.toMatchObject({ code: "browser_mismatch" });
    await expect(completeFlow(db, cfg, { code: p.issue(f.challenge), state: f.state, error: null, browserState: f.state }, p.fetchImpl)).rejects.toMatchObject({ code: "invalid_state" });
  });
  it("rejects unknown, missing, replayed and expired state", async () => {
    const p = provider();
    await expect(completeFlow(db, cfg, { code: "x", state: "forged", error: null, browserState: "forged" }, p.fetchImpl)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(completeFlow(db, cfg, { code: "x", state: null, error: null, browserState: null }, p.fetchImpl)).rejects.toMatchObject({ code: "invalid_state" });
    const f = await begin();
    await completeFlow(db, cfg, { code: p.issue(f.challenge), state: f.state, error: null, browserState: f.state }, p.fetchImpl);
    await expect(completeFlow(db, cfg, { code: p.issue(f.challenge), state: f.state, error: null, browserState: f.state }, p.fetchImpl)).rejects.toMatchObject({ code: "invalid_state" });
    vi.useFakeTimers({ toFake: ["Date"] });
    const g = await begin();
    vi.setSystemTime(Date.now() + 11 * 60_000);
    await expect(completeFlow(db, cfg, { code: p.issue(g.challenge), state: g.state, error: null, browserState: g.state }, p.fetchImpl)).rejects.toMatchObject({ code: "invalid_state" });
    vi.useRealTimers();
  });
  it("maps an expired or replayed authorization code to invalid_grant", async () => {
    const p = provider();
    const f = await begin();
    await expect(completeFlow(db, cfg, { code: "never-issued", state: f.state, error: null, browserState: f.state }, p.fetchImpl)).rejects.toMatchObject({ code: "invalid_grant" });
    const g = await begin();
    const code = p.issue(g.challenge);
    await completeFlow(db, cfg, { code, state: g.state, error: null, browserState: g.state }, p.fetchImpl);
    const h = await begin();
    await expect(completeFlow(db, cfg, { code, state: h.state, error: null, browserState: h.state }, p.fetchImpl)).rejects.toMatchObject({ code: "invalid_grant" });
  });
  it("maps consent denied, login/consent required and provider errors", async () => {
    const p = provider();
    for (const [error, code] of [["access_denied", "access_denied"], ["login_required", "login_required"], ["consent_required", "consent_required"], ["temporarily_unavailable", "provider_unavailable"], ["invalid_request", "provider_error"]] as const) {
      const f = await begin();
      await expect(completeFlow(db, cfg, { code: null, state: f.state, error, browserState: f.state }, p.fetchImpl)).rejects.toMatchObject({ code });
    }
  });
  it("treats provider outages and a wrong client secret distinctly", async () => {
    for (const [status, error, code] of [[503, "temporarily_unavailable", "provider_unavailable"], [429, "slow_down", "provider_unavailable"], [401, "invalid_client", "client_misconfigured"]] as const) {
      const p = provider({ status, error });
      const f = await begin();
      await expect(completeFlow(db, cfg, { code: "c", state: f.state, error: null, browserState: f.state }, p.fetchImpl)).rejects.toMatchObject({ code });
    }
    const f = await begin();
    const down = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(completeFlow(db, cfg, { code: "c", state: f.state, error: null, browserState: f.state }, down)).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});

describe("access token verification", () => {
  const bad = async (c: Claims, msg?: RegExp) => {
    provider();
    const e = await verifyAccessToken(cfg, await accessToken(c)).catch((x) => x);
    expect(e).toBeInstanceOf(SsoError);
    expect(e.code).toBe("token_invalid");
    if (msg) expect(e.message).toMatch(msg);
  };
  it("accepts a valid token", async () => {
    provider();
    expect((await verifyAccessToken(cfg, await accessToken())).sub).toBe("ait-user-1");
  });
  it("rejects wrong issuer, audience, expiry, scope and missing iat", async () => {
    await bad({ iss: "https://evil.example" });
    await bad({ aud: "collaborate" });
    await bad({ aud: ["avsar", "collaborate"] }, /one audience/);
    await bad({ exp: "-5m" });
    await bad({ scope: "admin" }, /scope/);
    await bad({ noIat: true });
  });
  it("rejects a token signed by an unpublished key (invalid signature)", async () => {
    await bad({ kid: "k2" });
  });
  it("rejects a forged token signed with another key under a published kid", async () => {
    provider();
    const rogue = await newKey("k1");
    const jwt = await new SignJWT({ scope: "profile:read" }).setProtectedHeader({ alg: "ES256", kid: "k1" }).setIssuer(cfg.issuer).setAudience("avsar").setSubject("victim").setIssuedAt().setExpirationTime("15m").sign(rogue.privateKey);
    await expect(verifyAccessToken(cfg, jwt)).rejects.toMatchObject({ code: "token_invalid" });
  });
  it("follows key rotation: a token with a newly published kid verifies after a JWKS refresh", async () => {
    provider();
    expect((await verifyAccessToken(cfg, await accessToken({ kid: "k1" }))).sub).toBe("ait-user-1");
    published = [keys[1], keys[0]]; // AI Tathastu rotates: new key first, old key kept during the rotation
    // Unknown kids trigger a refetch at most every 30 s (protects the provider's JWKS endpoint from floods),
    // so right after a fetch a brand-new kid is refused once...
    await expect(verifyAccessToken(cfg, await accessToken({ kid: "k2" }))).rejects.toMatchObject({ code: "token_invalid" });
    // ...and accepted once the cooldown has passed.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 31_000 });
    expect((await verifyAccessToken(cfg, await accessToken({ kid: "k2" }))).sub).toBe("ait-user-1");
    vi.useRealTimers();
    expect((await verifyAccessToken(cfg, await accessToken({ kid: "k1" }))).sub).toBe("ait-user-1");
  });
});

describe("sessions and redirects", () => {
  it("revoked sessions stop resolving (logout)", async () => {
    const id = await upsertIdentity(db, { provider: "ai_tathastu", subject: "sess-1", email: null, emailVerified: false, name: "S" });
    const s = await createSession(db, id.id);
    expect(await resolveSession(db, s.token)).not.toBeNull();
    await revokeSession(db, s.token);
    expect(await resolveSession(db, s.token)).toBeNull();
  });
  it("only allows same-site relative return paths", () => {
    expect(safeReturnTo("/app/saved?x=1")).toBe("/app/saved?x=1");
    for (const evil of ["https://evil.example", "//evil.example", "/\\evil.example", "/%2F%2Fevil.example/../", "javascript:alert(1)", "/\u0000x", "", null]) {
      const r = safeReturnTo(evil as string);
      expect(r.startsWith("/")).toBe(true);
      expect(r.startsWith("//")).toBe(false);
      expect(new URL(r, "https://avsar.invalid").origin).toBe("https://avsar.invalid");
    }
    expect(safeReturnTo("https://evil.example")).toBe("/app");
  });
});
