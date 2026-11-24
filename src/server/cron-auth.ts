import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time check of "Authorization: Bearer <CRON_SECRET>" (fixed-length digests). Secrets under 32 characters are refused. */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
