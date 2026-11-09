import "server-only";

import { lt, sql } from "drizzle-orm";

import type { Db } from "./db/client";
import { rateLimits } from "./db/schema";
import { reportError } from "./log";

/**
 * Fixed-window rate limiting stored in PostgreSQL (atomic upsert), so limits hold across instances.
 * Keys are namespaced ("login:ip:1.2.3.4", "apply:profile:<id>"); values never include secrets.
 */
export const LIMITS = {
  login: { limit: 20, windowSec: 60 },          // sign-in starts per IP
  callback: { limit: 30, windowSec: 60 },       // OAuth callbacks per IP
  devLogin: { limit: 30, windowSec: 60 },       // development sign-in per IP
  apply: { limit: 15, windowSec: 3600 },        // application submissions per candidate
  upload: { limit: 10, windowSec: 3600 },       // resume uploads per person
  report: { limit: 10, windowSec: 3600 },       // listing reports per person
  message: { limit: 40, windowSec: 3600 },      // messages per person
  invite: { limit: 30, windowSec: 3600 },       // invitations sent/accepted per person
  resumeRead: { limit: 20, windowSec: 3600 },   // resume suggestion runs per person
  supportIp: { limit: 5, windowSec: 3600 },     // public support form per client IP
  supportEmail: { limit: 3, windowSec: 3600 },  // public support form per email address
} as const;
export type LimitName = keyof typeof LIMITS;

export interface RateResult { ok: boolean; remaining: number; retryAfterSec: number }

/**
 * Fails open: if the limiter itself errors (e.g. a database hiccup), the request is allowed and the error is
 * reported, so abuse protection can never take sign-in or applying down on its own.
 */
export async function rateLimit(db: Db, name: LimitName, subject: string, now = new Date(), opts: { failClosed?: boolean } = {}): Promise<RateResult> {
  try {
    return await count(db, name, subject, now);
  } catch (err) {
    void reportError(err, { where: "rate-limit", limit: name });
    // Signed-in flows fail open (never lock users out); public anonymous endpoints can choose to fail closed.
    return opts.failClosed ? { ok: false, remaining: 0, retryAfterSec: 60 } : { ok: true, remaining: 0, retryAfterSec: 0 };
  }
}

async function count(db: Db, name: LimitName, subject: string, now: Date): Promise<RateResult> {
  const { limit, windowSec } = LIMITS[name];
  const windowMs = windowSec * 1000;
  const start = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const key = `${name}:${subject}`.slice(0, 200);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: start, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  // Opportunistic cleanup of windows older than a day (cheap, indexed by primary key prefix).
  if (Math.random() < 0.01) await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 86_400_000))).catch(() => undefined);
  const retryAfterSec = Math.ceil((start.getTime() + windowMs - now.getTime()) / 1000);
  return { ok: row.count <= limit, remaining: Math.max(0, limit - row.count), retryAfterSec };
}

/**
 * The client IP used for per-IP limits. Client-supplied headers are NOT trusted by default:
 *  - AVSAR_CLIENT_IP_HEADER=<name>: a single-value header your host's edge proxy sets and overwrites (check your host's
 *    documentation, e.g. x-real-ip or a CDN's connecting-IP header). Used as-is.
 *  - AVSAR_TRUSTED_PROXY_HOPS=<n>: take the n-th address from the RIGHT of x-forwarded-for (entries added by your n
 *    trusted proxies); anything to the left was written by the client and is ignored.
 *  - Neither set: development uses the first x-forwarded-for entry (local testing only); production uses ONE shared
 *    "untrusted" bucket (safe: never spoofable, may throttle everyone together) and the health check reports it.
 */
export function clientIp(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  const clean = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    return /^[0-9a-fA-F:.]{2,64}$/.test(s) ? s : null; // IPv4/IPv6 characters only
  };
  const header = env.AVSAR_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (header) return clean(headers.get(header)) ?? "unknown";
  const hops = Number(env.AVSAR_TRUSTED_PROXY_HOPS ?? "");
  const chain = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (Number.isInteger(hops) && hops > 0) return clean(chain[chain.length - hops]) ?? "unknown";
  if (env.NODE_ENV === "production") return "untrusted";
  return clean(chain[0]) ?? clean(headers.get("x-real-ip")) ?? "unknown";
}

/** True when production has no trusted way to read client IPs (reported by /api/health and startup checks). */
export const clientIpUntrusted = (env: Record<string, string | undefined> = process.env) =>
  env.NODE_ENV === "production" && !env.AVSAR_CLIENT_IP_HEADER && !(Number(env.AVSAR_TRUSTED_PROXY_HOPS) > 0);

export const TOO_MANY = "Too many attempts. Please wait a little and try again.";
