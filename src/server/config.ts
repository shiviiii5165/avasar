import "server-only";

/**
 * Typed access to Avsar's own environment (see .env.example). Values are read lazily so a missing
 * optional integration never prevents the rest of the app from running. Secrets are never logged.
 */
const env = (k: string) => process.env[k]?.trim() || undefined;

export const isProduction = () => process.env.NODE_ENV === "production";

/** Development sign-in: only when explicitly enabled AND not in production. */
export const devAuthEnabled = () => env("AVSAR_DEV_AUTH") === "1" && !isProduction();

export function publicUrl(): string {
  return env("AVSAR_PUBLIC_URL") ?? "http://localhost:3000";
}

export interface TathastuConfig {
  issuer: string;
  authorizeUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  profileUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
}

/** AI Tathastu SSO, Avsar's OWN client registration. Returns null (with the missing names) until configured. */
export function tathastuConfig(): { config: TathastuConfig | null; missing: string[] } {
  const base = env("AVSAR_AIT_BASE_URL");
  const values = {
    issuer: env("AVSAR_AIT_ISSUER") ?? base,
    authorizeUrl: env("AVSAR_AIT_AUTHORIZE_URL") ?? (base && `${base}/integrations/authorize`),
    tokenUrl: env("AVSAR_AIT_TOKEN_URL") ?? (base && `${base}/api/integrations/sso/token`),
    jwksUrl: env("AVSAR_AIT_JWKS_URL") ?? (base && `${base}/api/integrations/jwks`),
    profileUrl: env("AVSAR_AIT_PROFILE_URL") ?? (base && `${base}/api/integrations/v1/profile`),
    clientId: env("AVSAR_AIT_CLIENT_ID"),
    clientSecret: env("AVSAR_AIT_CLIENT_SECRET"),
    redirectUri: env("AVSAR_AIT_REDIRECT_URI") ?? `${publicUrl()}/api/auth/callback`,
    scopes: env("AVSAR_AIT_SCOPES") ?? "openid profile email",
  };
  const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
  return { config: missing.length ? null : (values as TathastuConfig), missing };
}

/** HMAC key for short-lived document URLs. Required in production. */
export function signingSecret(): string {
  const s = env("AVSAR_SIGNING_SECRET");
  if (s && s.length >= 32) return s;
  if (isProduction()) throw new Error("AVSAR_SIGNING_SECRET (32+ characters) is required in production.");
  return "dev-only-signing-secret-not-for-production-use";
}

/** "provider:subject" pairs that are granted Super Admin on sign-in (bootstrap only; audited). */
export function bootstrapSuperAdmins(): string[] {
  return (env("AVSAR_BOOTSTRAP_SUPER_ADMINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Feature gates for releases that are built but not yet switched on for real users. */
export const features = {
  /** Employer Studio workspace. On in development; in production only when the owner enables it. Publishing stays admin-only regardless. */
  employerStudio: () => env("AVSAR_FEATURE_EMPLOYER_STUDIO") === "1" || !isProduction(),
  employerSelfPublishing: () => env("AVSAR_FEATURE_EMPLOYER_PUBLISHING") === "1",
};
