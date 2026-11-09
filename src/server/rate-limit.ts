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
} as const;
export type LimitName = keyof typeof LIMITS;

export interface RateResult { ok: boolean; remaining: number; retryAfterSec: number }

/**
 * Fails open: if the limiter itself errors (e.g. a database hiccup), the request is allowed and the error is
 * reported, so abuse protection can never take sign-in or applying down on its own.
 */
export async function rateLimit(db: Db, name: LimitName, subject: string, now = new Date()): Promise<RateResult> {
  try {
    return await count(db, name, subject, now);
  } catch (err) {
    void reportError(err, { where: "rate-limit", limit: name });
    return { ok: true, remaining: 0, retryAfterSec: 0 };
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

/** Client IP from the proxy header (the first hop is set by the trusted hosting proxy), else "unknown". */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || headers.get("x-real-ip") || "unknown").slice(0, 64);
}

export const TOO_MANY = "Too many attempts. Please wait a little and try again.";
