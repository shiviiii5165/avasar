/**
 * Strict, nonce-based Content-Security-Policy (stage 1 of the rollout: REPORT-ONLY).
 *
 * A fresh nonce per request; Next.js reads it from the request CSP header and adds it to its own scripts.
 * Rollout (cspMode): ENFORCED on Vercel preview deployments, REPORT-ONLY in production until the owner sets
 * AVSAR_CSP_MODE=enforce after checking the preview. When enforced, the proxy's header replaces the older
 * next.config.ts policy (which allows 'unsafe-inline'); checked locally: one Content-Security-Policy header.
 */
export const CSP_NONCE_HEADER = "x-nonce";

/** "enforce" on Vercel previews or when AVSAR_CSP_MODE=enforce; "report-only" otherwise. An explicit setting always wins. */
export function cspMode(env: Record<string, string | undefined>): "enforce" | "report-only" {
  const v = env.AVSAR_CSP_MODE?.trim().toLowerCase();
  if (v === "enforce" || v === "report-only") return v;
  return env.VERCEL_ENV === "preview" ? "enforce" : "report-only";
}

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function strictCsp(nonce: string, opts: { dev: boolean; formAction?: string }): string {
  if (!/^[A-Za-z0-9+/=]{16,64}$/.test(nonce)) throw new Error("invalid nonce");
  const formTarget = opts.formAction && /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(opts.formAction) ? ` ${opts.formAction}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    `form-action 'self'${formTarget}`,
    "object-src 'none'",
  ].join("; ");
}
