import "server-only";

import { and, eq, lte, sql } from "drizzle-orm";

import type { Db } from "../db/client";
import { jobs, opportunities, userIdentities } from "../db/schema";

/**
 * Durable background jobs in PostgreSQL: idempotent enqueue (by key), claim with SKIP LOCKED, retries with
 * exponential backoff, dead-letter after maxAttempts, and a stale-lock reaper for crashed workers.
 */
export async function enqueueJob(db: Pick<Db, "insert">, type: string, payload: Record<string, unknown>, idempotencyKey?: string, runAt = new Date()) {
  await db.insert(jobs).values({ type, payload, idempotencyKey: idempotencyKey ?? null, runAt }).onConflictDoNothing();
}

export type JobRow = typeof jobs.$inferSelect;
export type Handler = (db: Db, job: JobRow) => Promise<void>;

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
export const backoffMs = (attempt: number) => Math.min(60 * 60 * 1000, 2 ** attempt * 15_000);

export async function claimJobs(db: Db, limit = 10, now = new Date()): Promise<JobRow[]> {
  // Reap jobs locked by a worker that died.
  await db.update(jobs).set({ status: "queued", lockedAt: null }).where(and(eq(jobs.status, "running"), lte(jobs.lockedAt, new Date(now.getTime() - LOCK_TIMEOUT_MS))));
  const res = await db.execute(sql`
    update jobs set status = 'running', locked_at = ${now}, attempts = attempts + 1
    where id in (select id from jobs where status = 'queued' and run_at <= ${now} order by run_at limit ${limit} for update skip locked)
    returning id`);
  const ids = (res as unknown as { rows: { id: string }[] }).rows.map((r) => r.id);
  if (!ids.length) return [];
  return db.select().from(jobs).where(sql`${jobs.id} in ${ids}`);
}

export async function runJob(db: Db, job: JobRow, handlers: Record<string, Handler>, now = new Date()) {
  const handler = handlers[job.type];
  try {
    if (!handler) throw new Error(`No handler for ${job.type}`);
    await handler(db, job);
    await db.update(jobs).set({ status: "done", finishedAt: new Date(), lastError: null, lockedAt: null }).where(eq(jobs.id, job.id));
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    const dead = job.attempts >= job.maxAttempts;
    await db
      .update(jobs)
      .set({ status: dead ? "dead" : "queued", lastError: message, lockedAt: null, runAt: dead ? job.runAt : new Date(now.getTime() + backoffMs(job.attempts)) })
      .where(eq(jobs.id, job.id));
  }
}

/** Default handlers. Email delivery uses a provider adapter; without one configured it logs and succeeds. */
export const defaultHandlers: Record<string, Handler> = {
  "email.notification": async (db, job) => {
    const [who] = await db.select({ email: userIdentities.email }).from(userIdentities).where(eq(userIdentities.id, String(job.payload.identityId)));
    if (!who?.email) return; // nothing to send to; in-app notification already exists
    await sendEmail({ to: who.email, subject: String(job.payload.title), text: `${job.payload.body ?? ""}\n\n${process.env.AVSAR_PUBLIC_URL ?? ""}${job.payload.link ?? ""}` });
  },
  /** Organization invitation. The link carries a one-time token; acceptance requires signing in, and never matches on email. */
  "email.invitation": async (_db, job) => {
    await sendEmail({ to: String(job.payload.to), subject: `You're invited to ${job.payload.orgName} on Avsar Employer Studio`, text: `Accept the invitation (expires in 7 days):\n${process.env.AVSAR_PUBLIC_URL ?? ""}${job.payload.link}` });
  },
  "opportunity.expire": async (db) => {
    // Published listings whose deadline passed become "expired" (never deleted).
    await db.update(opportunities).set({ status: "expired", updatedAt: new Date() }).where(and(eq(opportunities.status, "published"), lte(opportunities.deadline, new Date())));
  },
};

async function sendEmail(msg: { to: string; subject: string; text: string }) {
  const endpoint = process.env.AVSAR_EMAIL_WEBHOOK_URL;
  if (!endpoint) {
    console.info(`[email] provider not configured; would send "${msg.subject}" to ${msg.to.replace(/(.).+(@.+)/, "$1***$2")}`);
    return;
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AVSAR_EMAIL_WEBHOOK_TOKEN ?? ""}` },
    body: JSON.stringify(msg),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`email provider returned ${res.status}`); // retried with backoff
}
