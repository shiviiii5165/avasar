import { and, count, eq, lte, sql } from "drizzle-orm";

import { getDb } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import { emailMode } from "@/server/email";
import { secretMatches } from "@/server/http";
import { productionEnvProblems } from "@/server/env-check";
import { tathastuConfig } from "@/server/config";
import { storage } from "@/server/storage";

export const dynamic = "force-dynamic";

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/**
 * GET /api/health — READINESS (dependencies and configuration) for the host's health checks and monitoring.
 * Liveness (process is up, no dependency calls) is GET /api/health/live.
 * Public response: overall status and pass/fail per dependency, never values or setting names.
 * With header `x-health-token: <AVSAR_HEALTH_TOKEN>` it also lists missing production settings by name.
 */
export async function GET(request: Request) {
  const checks: Record<string, "ok" | "degraded" | "fail"> = {};
  let detail: Record<string, unknown> = {};
  try {
    const db = await getDb();
    await within(db.execute(sql`select 1`), 3000);
    checks.database = "ok";
    const [[queued], [dead], [stale]] = await Promise.all([
      db.select({ n: count() }).from(jobs).where(eq(jobs.status, "queued")),
      db.select({ n: count() }).from(jobs).where(eq(jobs.status, "dead")),
      db.select({ n: count() }).from(jobs).where(and(eq(jobs.status, "queued"), lte(jobs.runAt, new Date(Date.now() - 15 * 60_000)))),
    ]);
    // Jobs waiting >15 minutes mean the worker isn't running; dead letters need attention.
    checks.worker = stale.n > 0 ? "fail" : dead.n > 0 ? "degraded" : "ok";
    detail = { jobs: { queued: queued.n, dead: dead.n, overdue: stale.n } };
  } catch {
    checks.database = "fail";
  }
  try { await within(storage().check(), 3000); checks.storage = "ok"; } catch { checks.storage = "fail"; }
  checks.email = emailMode() === "unconfigured" ? "fail" : "ok";
  checks.sso = tathastuConfig().config ? "ok" : "degraded";
  if (process.env.NODE_ENV === "production") {
    const problems = productionEnvProblems();
    checks.configuration = problems.some((p) => p.critical) ? "fail" : problems.length ? "degraded" : "ok";
  }

  const status = Object.values(checks).includes("fail") ? "fail" : Object.values(checks).includes("degraded") ? "degraded" : "ok";
  const authorized = secretMatches(request.headers.get("x-health-token"), process.env.AVSAR_HEALTH_TOKEN);
  const body = {
    status,
    checks,
    ...(authorized ? { ...detail, missingSettings: process.env.NODE_ENV === "production" ? productionEnvProblems().map((p) => `${p.name}: ${p.problem}`) : [] } : {}),
    time: new Date().toISOString(),
  };
  return Response.json(body, { status: status === "fail" ? 503 : 200, headers: { "cache-control": "no-store" } });
}