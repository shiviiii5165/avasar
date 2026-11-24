import { NextResponse } from "next/server";

import { cronAuthorized } from "@/server/cron-auth";
import { getDb } from "@/server/db/client";
import { log } from "@/server/log";
import { runScheduledIngestion } from "@/server/services/ingestion";

/**
 * GET /api/cron/ingest — scheduled source ingestion (Vercel Cron, see vercel.json).
 *
 * Off (503) until CRON_SECRET (32+ characters) is set. Vercel Cron sends it as "Authorization: Bearer <secret>";
 * any other caller gets 401 with no detail. The comparison is constant-time over fixed-length hashes.
 * Work is bounded: sources are leased one at a time and the pass stops at TIME_BUDGET_MS, well inside maxDuration;
 * whatever is left stays due for the next pass. Permission, switch, configuration and per-source request budgets
 * are enforced by the pipeline itself on every source.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const TIME_BUDGET_MS = 40_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) return NextResponse.json({ ok: false, error: "NOT_CONFIGURED" }, { status: 503 });
  if (!cronAuthorized(request.headers.get("authorization"), secret)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const summary = await runScheduledIngestion(await getDb(), { budgetMs: TIME_BUDGET_MS, maxSources: 25 });
    log("info", "cron.ingest", { sources: summary.sources.length, expired: summary.expired, stoppedBy: summary.stoppedBy, elapsedMs: summary.elapsedMs });
    // Counts only: no listing content, source URLs or errors leave the server here.
    return NextResponse.json({ ok: true, sources: summary.sources.map(({ status, collected, created, updated, duplicates, rejected }) => ({ status, collected, created, updated, duplicates, rejected })), expired: summary.expired, stoppedBy: summary.stoppedBy });
  } catch (err) {
    log("error", "cron.ingest_failed", { message: (err instanceof Error ? err.message : String(err)).slice(0, 200) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
