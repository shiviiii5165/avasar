import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { createJwksStore, validKeys } from "./jwks";

type K = { kid: string; priv: CryptoKey; pub: Record<string, unknown> };
const mk = async (kid: string): Promise<K> => {
  const p = await generateKeyPair("ES256", { extractable: true });
  return { kid, priv: p.privateKey, pub: { ...(await exportJWK(p.publicKey)), kid, alg: "ES256", use: "sig" } };
};
let a: K, b: K, c: K;
beforeAll(async () => { a = await mk("a"); b = await mk("b"); c = await mk("c"); });

const tok = (k: K, opts: { exp?: string; kid?: string } = {}) =>
  new SignJWT({ scope: "profile:read" }).setProtectedHeader({ alg: "ES256", kid: opts.kid ?? k.kid }).setIssuer("https://www.aitathastu.com")
    .setAudience("avsar").setSubject("u1").setIssuedAt().setExpirationTime(opts.exp ?? "15m").sign(k.priv);
const verify = (store: ReturnType<typeof createJwksStore>, jwt: string) =>
  jwtVerify(jwt, store.getKey, { issuer: "https://www.aitathastu.com", audience: "avsar", algorithms: ["ES256"], requiredClaims: ["exp", "iat", "sub"] });

/** A JWKS endpoint whose published keys and behaviour the test controls. */
function endpoint(initial: Record<string, unknown>[]) {
  const state = { keys: initial, mode: "ok" as "ok" | "down" | "timeout" | "badjson" | "500", delayMs: 0 };
  const fetchImpl = vi.fn(async () => {
    if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
    if (state.mode === "down" || state.mode === "timeout") throw new TypeError("fetch failed");
    if (state.mode === "500") return new Response("err", { status: 500 });
    if (state.mode === "badjson") return new Response("<html>", { status: 200 });
    return Response.json({ keys: state.keys });
  });
  return { state, fetchImpl: fetchImpl as unknown as typeof fetch, calls: () => fetchImpl.mock.calls.length };
}

describe("JWKS key store", () => {
  it("verifies with cached keys without refetching", async () => {
    const e = endpoint([a.pub]);
    const s = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl });
    await verify(s, await tok(a));
    await verify(s, await tok(a));
    expect(e.calls()).toBe(1);
  });

  it("unknown kid → one immediate refresh → success (rotation while the cache is still valid)", async () => {
    const e = endpoint([a.pub]);
    const s = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl });
    await verify(s, await tok(a));
    e.state.keys = [b.pub, a.pub]; // provider rotates; old key kept published
    await verify(s, await tok(b)); // inside the cache window, no waiting
    expect(e.calls()).toBe(2);
    await verify(s, await tok(a)); // retired key still works during the rotation
    expect(e.calls()).toBe(2);
  });

  it("unknown kid still missing after refresh is refused and not refetched for every token", async () => {
    const e = endpoint([a.pub]);
    const s = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl });
    await verify(s, await tok(a));
    await expect(verify(s, await tok(c))).rejects.toMatchObject({ code: "unknown_kid" });
    await expect(verify(s, await tok(c))).rejects.toMatchObject({ code: "unknown_kid" });
    expect(e.calls()).toBe(2); // negative cache: one refresh for the bogus kid, not one per token
  });

  it("concurrent tokens with a newly rotated key share a single refresh", async () => {
    const e = endpoint([a.pub]);
    const s = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl });
    await verify(s, await tok(a));
    e.state.keys = [a.pub, b.pub];
    e.state.delayMs = 50;
    const jwt = await tok(b);
    await Promise.all(Array.from({ length: 20 }, () => verify(s, jwt)));
    expect(e.calls()).toBe(2);
  });

  it("bounds forced refreshes (budget per minute)", async () => {
    const e = endpoint([a.pub]);
    const s = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl, maxForcedPerMinute: 3 });
    await verify(s, await tok(a));
    for (const kid of ["x1", "x2", "x3", "x4", "x5"]) await expect(verify(s, await tok(a, { kid }))).rejects.toBeTruthy();
    expect(e.calls()).toBe(4); // 1 initial + 3 forced; the rest refused without fetching
  });

  it("provider unavailable, timeout, HTTP error or malformed JSON during a forced refresh never accepts the token", async () => {
    for (const mode of ["down", "timeout", "500", "badjson"] as const) {
      const e = endpoint([a.pub]);
      const s = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl });
      await verify(s, await tok(a));
      e.state.mode = mode;
      await expect(verify(s, await tok(b))).rejects.toMatchObject({ code: "unavailable" });
      await verify(s, await tok(a)); // known keys keep working while the provider is down
    }
  });

  it("first fetch failing (no cached keys) refuses", async () => {
    const e = endpoint([a.pub]);
    e.state.mode = "down";
    const s = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl });
    await expect(verify(s, await tok(a))).rejects.toMatchObject({ code: "unavailable" });
  });

  it("refuses a duplicated kid even if one copy is the real key", async () => {
    const e = endpoint([a.pub, { ...b.pub, kid: "a" }]);
    const s = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl });
    await expect(verify(s, await tok(a))).rejects.toMatchObject({ code: "unknown_kid" });
  });

  it("ignores keys with the wrong type, curve, algorithm, use or a private part", () => {
    const base = a.pub as Record<string, unknown>;
    const { keys, rejected } = validKeys({ keys: [
      { ...base, kid: "rsa", kty: "RSA" }, { ...base, kid: "p384", crv: "P-384" }, { ...base, kid: "rs", alg: "RS256" },
      { ...base, kid: "enc", use: "enc" }, { ...base, kid: "priv", d: "secret" }, { ...base, kid: "nox", x: undefined }, { ...base, kid: "ok" },
    ] });
    expect([...keys.keys()]).toEqual(["ok"]);
    expect(rejected).toBe(6);
    expect(() => validKeys({ nope: [] })).toThrow();
  });

  it("rejects non-ES256 tokens and tokens without a kid before any key lookup", async () => {
    const e = endpoint([a.pub]);
    const s = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl });
    const hs = await new SignJWT({}).setProtectedHeader({ alg: "HS256", kid: "a" }).setIssuer("https://www.aitathastu.com").setAudience("avsar").setSubject("u1").setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode("x".repeat(32)));
    await expect(s.getKey({ alg: "HS256", kid: "a" }, { payload: "", signature: "" } as never)).rejects.toMatchObject({ code: "bad_algorithm" });
    await expect(verify(s, hs)).rejects.toBeTruthy();
    await expect(s.getKey({ alg: "ES256" }, { payload: "", signature: "" } as never)).rejects.toMatchObject({ code: "no_kid" });
    expect(e.calls()).toBe(0);
  });

  it("expired tokens are refused even with a valid key; a token for a revoked (unpublished) key is refused after refresh", async () => {
    const e = endpoint([a.pub, b.pub]);
    const s = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl });
    await expect(verify(s, await tok(a, { exp: "-1m" }))).rejects.toMatchObject({ code: "ERR_JWT_EXPIRED" });
    const jwtB = await tok(b);
    await verify(s, jwtB); // replaying a still-valid token verifies cryptographically; replay is prevented by state/code single use upstream
    e.state.keys = [a.pub]; // provider retires b
    const fresh = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl });
    await expect(verify(fresh, jwtB)).rejects.toMatchObject({ code: "unknown_kid" });
  });

  it("refreshes after max age", async () => {
    let t = 1_000_000;
    const e = endpoint([a.pub]);
    const s = createJwksStore("https://idp/jwks", { fetchImpl: e.fetchImpl, maxAgeMs: 1000, now: () => t });
    await verify(s, await tok(a));
    t += 2000;
    await verify(s, await tok(a));
    expect(e.calls()).toBe(2);
  });
});
