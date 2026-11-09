import "server-only";

import { importJWK, type JWK, type JWTVerifyGetKey } from "jose";

/**
 * AI Tathastu signing keys (contract: src/lib/integrations/tokens.ts publicPart → { kty:"EC", crv:"P-256", x, y, kid, alg:"ES256", use:"sig" };
 * retired public keys stay published during a rotation; the endpoint may be cached for an hour).
 *
 * Behaviour:
 *  - Normal caching: the key set is reused for `maxAgeMs`.
 *  - Unknown kid: ONE immediate, bounded refresh, shared by concurrent callers (single flight), then one retry.
 *    A newly rotated key therefore verifies at once, not after a cooldown.
 *  - Storm protection: at most `maxForcedPerMinute` forced refreshes per minute, and a kid that was still missing
 *    after a refresh is remembered for `negativeTtlMs` (no refetch per bogus token).
 *  - Only valid keys are usable: EC P-256, alg ES256 (if present), use "sig" (if present), x and y present, no private
 *    part. A kid that appears more than once is ambiguous and never used. Timeouts, bad JSON or HTTP errors keep the
 *    previous good key set (never "accept unverified").
 */
export interface JwksOptions {
  maxAgeMs?: number;
  timeoutMs?: number;
  maxForcedPerMinute?: number;
  negativeTtlMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class JwksError extends Error {
  constructor(public readonly code: "unknown_kid" | "unavailable" | "bad_algorithm" | "no_kid", message: string) {
    super(message);
  }
}

type Usable = Map<string, CryptoKey>;

export function validKeys(raw: unknown): { keys: Map<string, JWK>; rejected: number } {
  const list = (raw as { keys?: unknown })?.keys;
  if (!Array.isArray(list)) throw new JwksError("unavailable", "JWKS response has no keys array");
  const byKid = new Map<string, JWK>();
  const dup = new Set<string>();
  let rejected = 0;
  for (const k of list as JWK[]) {
    const ok = k && typeof k === "object" && typeof k.kid === "string" && k.kid.length > 0 && k.kty === "EC" && k.crv === "P-256"
      && typeof k.x === "string" && typeof k.y === "string" && !("d" in k)
      && (k.alg === undefined || k.alg === "ES256") && (k.use === undefined || k.use === "sig");
    if (!ok) { rejected++; continue; }
    if (byKid.has(k.kid!)) dup.add(k.kid!);
    byKid.set(k.kid!, { kty: "EC", crv: "P-256", x: k.x, y: k.y, kid: k.kid, alg: "ES256", use: "sig" });
  }
  for (const kid of dup) { byKid.delete(kid); rejected++; } // ambiguous: never pick one of two different keys
  return { keys: byKid, rejected };
}

export function createJwksStore(url: string, opts: JwksOptions = {}) {
  const maxAgeMs = opts.maxAgeMs ?? 10 * 60_000;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const maxForced = opts.maxForcedPerMinute ?? 10;
  const negativeTtlMs = opts.negativeTtlMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const fetchImpl = () => opts.fetchImpl ?? fetch;

  let keys: Usable | null = null;
  let fetchedAt = 0;
  let inflight: Promise<Usable> | null = null;
  let forced: number[] = [];
  const missing = new Map<string, number>(); // kid → time it was confirmed missing
  let fetchCount = 0;

  async function load(): Promise<Usable> {
    fetchCount++;
    let res: Response;
    try {
      res = await fetchImpl()(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    } catch {
      throw new JwksError("unavailable", "JWKS endpoint unreachable or timed out");
    }
    if (!res.ok) throw new JwksError("unavailable", `JWKS endpoint returned ${res.status}`);
    let body: unknown;
    try { body = await res.json(); } catch { throw new JwksError("unavailable", "JWKS response is not valid JSON"); }
    const { keys: jwks } = validKeys(body);
    const out: Usable = new Map();
    for (const [kid, jwk] of jwks) {
      try { out.set(kid, (await importJWK(jwk, "ES256")) as CryptoKey); } catch { /* unusable coordinates: skip */ }
    }
    return out;
  }

  /** Single flight: concurrent callers share one fetch. On failure the previous good set stays. */
  function refresh(): Promise<Usable> {
    inflight ??= load()
      .then((k) => { keys = k; fetchedAt = now(); for (const kid of k.keys()) missing.delete(kid); return k; })
      .finally(() => { inflight = null; });
    return inflight;
  }

  async function getKeyForKid(kid: string): Promise<CryptoKey> {
    if (!keys || now() - fetchedAt > maxAgeMs) {
      try { await refresh(); } catch (e) { if (!keys) throw e; } // stale-but-good keys are better than none
    }
    const hit = keys!.get(kid);
    if (hit) return hit;

    // Unknown kid: refresh once, immediately, unless this kid was just confirmed missing or the budget is spent.
    const seen = missing.get(kid);
    if (seen !== undefined && now() - seen < negativeTtlMs) throw new JwksError("unknown_kid", "signing key not published");
    forced = forced.filter((t) => now() - t < 60_000);
    if (!inflight) {
      if (forced.length >= maxForced) throw new JwksError("unknown_kid", "signing key not published (refresh budget exhausted)");
      forced.push(now());
    }
    await refresh(); // throws "unavailable" if the provider is down: the token is NOT accepted
    const after = keys!.get(kid);
    if (after) return after;
    missing.set(kid, now());
    throw new JwksError("unknown_kid", "signing key not published");
  }

  const getKey: JWTVerifyGetKey = async (header) => {
    if (header.alg !== "ES256") throw new JwksError("bad_algorithm", "only ES256 tokens are accepted");
    if (!header.kid) throw new JwksError("no_kid", "token has no key id");
    return getKeyForKid(header.kid);
  };

  return { getKey, stats: () => ({ fetchCount, cachedKids: keys ? [...keys.keys()] : [] }) };
}
