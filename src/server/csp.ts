/**
 * Strict, nonce-based Content-Security-Policy (stage 1 of the rollout: REPORT-ONLY).
 *
 * The enforced policy in next.config.ts still allows 'unsafe-inline' scripts. This stricter policy is sent as
 * Content-Security-Policy-Report-Only with a fresh nonce per request; Next.js reads the nonce from that request
 * header and adds it to its own scripts. Browsers only log violations, so nothing can break. Stage 2 (after
 * checking the browser console on every page type) is to send this same policy as the enforced header.
 */
export const CSP_NONCE_HEADER = "x-nonce";

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
