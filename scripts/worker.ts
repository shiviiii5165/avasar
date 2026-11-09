/**
 * Background worker: `npm run worker`. Claims jobs, runs handlers with retries/backoff/dead-letter,
 * schedules the daily expiry sweep, and shuts down gracefully on SIGINT/SIGTERM (finishes the batch).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import pg from "pg";

import * as schema from "../src/server/db/schema";
import type { Db } from "../src/server/db/client";
import { claimJobs, defaultHandlers, enqueueJob, runJob } from "../src/server/services/jobs";

let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function main() {
  // Same database as the web app. Production never falls back to the embedded development database.
  if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is required in production (the worker must use the same database as the web app).");
  const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 }) : null;
  const db: Db = pool
    ? (drizzlePg(pool, { schema }) as unknown as Db)
    : (mkdirSync(path.join(process.cwd(), ".data"), { recursive: true }), drizzlePglite(new PGlite(path.join(process.cwd(), ".data/pglite")), { schema }));
  console.log(`[worker] started (${pool ? "PostgreSQL" : "embedded development database"})`);
  while (!stopping) {
    const day = new Date().toISOString().slice(0, 10);
    await enqueueJob(db, "opportunity.expire", {}, `expire:${day}`);
    const batch = await claimJobs(db, 10);
    for (const job of batch) await runJob(db, job, defaultHandlers);
    if (!batch.length) await new Promise((r) => setTimeout(r, 5_000));
  }
  await pool?.end();
  console.log("[worker] stopped cleanly");
  process.exit(0);
}

main().catch((err) => {
  console.error("[worker] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
