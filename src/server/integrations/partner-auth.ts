import "server-only";

import { jwtVerify, type JWTVerifyGetKey } from "jose";

import { createJwksStore } from "../auth/jwks";

/**
 * Authentication for Avsar's partner API (GET /api/partner/v1/*).
 *
 * The only partner today is AI Tathastu. It authenticates with a short-lived ES256 *service assertion*
 * signed by its integration signing key, which Avsar already trusts for sign-in (same JWKS). No shared
 * secret exists, and the assertion is deliberately distinct from a user's sign-in token:
 *   iss = AI Tathastu's issuer, sub = "ai-tathastu", aud = "avsar-partner-api",
 *   scope = "opportunities:read", typ "JWT", lifetime at most 5 minutes, jti present.
 * A user access token (aud = Avsar's client id, scope = "profile:read") is therefore rejected here, and
 * a partner assertion can never sign anyone in.
 *
 * Disabled unless AVSAR_PARTNER_API_AIT=1. Configuration: AVSAR_AIT_JWKS_URL (or AVSAR_AIT_BASE_URL) and
 * optionally AVSAR_AIT_ISSUER, the same values the sign-in integration uses.
 */
export const PARTNER_AUDIENCE = "avsar-partner-api";
export const PARTNER_SCOPE = "opportunities:read";
export const PARTNER_SUBJECT = "ai-tathastu";
const MAX_LIFETIME_SEC = 300;

export interface PartnerConfig {
  issuer: string;
  jwksUrl: string;
}

const env = (k: string) => process.env[k]?.trim() || undefined;

/** null when the partner API is switched off or not configured (the route then answers 503). */
export function partnerConfig(): PartnerConfig | null {
  if (env("AVSAR_PARTNER_API_AIT") !== "1") return null;
  const base = env("AVSAR_AIT_BASE_URL");
  const jwksUrl = env("AVSAR_AIT_JWKS_URL") ?? (base && `${base.replace(/\/$/, "")}/api/integrations/jwks`);
  if (!jwksUrl) return null;
  return { issuer: env("AVSAR_AIT_ISSUER") ?? "https://www.aitathastu.com", jwksUrl };
}

export type PartnerAuthResult = { ok: true; partner: typeof PARTNER_SUBJECT } | { ok: false; status: 401 | 503; code: "missing_token" | "invalid_token" | "keys_unavailable" };

const stores = new Map<string, JWTVerifyGetKey>();
const keysFor = (url: string) => {
  let k = stores.get(url);
  if (!k) stores.set(url, (k = createJwksStore(url).getKey));
  return k;
};

export async function verifyPartnerRequest(request: Request, cfg: PartnerConfig, getKey: JWTVerifyGetKey = keysFor(cfg.jwksUrl)): Promise<PartnerAuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer ([A-Za-z0-9_\-.]+)$/.exec(header);
  if (!m) return { ok: false, status: 401, code: "missing_token" };
  try {
    const { payload, protectedHeader } = await jwtVerify(m[1]!, getKey, {
      issuer: cfg.issuer,
      audience: PARTNER_AUDIENCE,
      subject: PARTNER_SUBJECT,
      algorithms: ["ES256"],
      requiredClaims: ["exp", "iat", "jti", "sub"],
      clockTolerance: 30,
    });
    if (protectedHeader.typ !== undefined && protectedHeader.typ !== "JWT") return { ok: false, status: 401, code: "invalid_token" };
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (aud.length !== 1 || payload.scope !== PARTNER_SCOPE) return { ok: false, status: 401, code: "invalid_token" };
    if (typeof payload.exp !== "number" || typeof payload.iat !== "number" || payload.exp - payload.iat > MAX_LIFETIME_SEC) {
      return { ok: false, status: 401, code: "invalid_token" };
    }
    return { ok: true, partner: PARTNER_SUBJECT };
  } catch (e) {
    // The key set could not be fetched: a temporary condition on our side, not a bad token.
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "unavailable") return { ok: false, status: 503, code: "keys_unavailable" };
    return { ok: false, status: 401, code: "invalid_token" };
  }
}
