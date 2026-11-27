import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";

import { log } from "../log";
import { pgPoolOptions } from "./pg-options";
import * as schema from "./schema";

/**
 * One database handle for the app.
 *  - DATABASE_URL set: PostgreSQL (staging/production). Migrations are applied by `npm run db:migrate`
 *    as a deploy step, never implicitly at request time.
 *  - Not set: an embedded PGlite database in .data/pglite for local development, migrated on first use.
 *    Production refuses to start without DATABASE_URL (see assertProductionConfig).
 * Both expose the same Drizzle query API; the PGlite type is used as the common surface.
 */
export type Db = PgliteDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "src/server/db/migrations");

declare global {
  var __avsarDb: Promise<Db> | undefined;
}

/**
 * Browser tests force the embedded database (AVSAR_EMBEDDED_DB=1) in their own directory (AVSAR_PGLITE_DIR),
 * so a DATABASE_URL in .env.local can never be reached by a test run. Ignored in production.
 */
export function embeddedDbDir() {
  return path.resolve(process.cwd(), process.env.AVSAR_PGLITE_DIR || ".data/pglite");
}
const forceEmbedded = () => process.env.AVSAR_EMBEDDED_DB === "1" && process.env.NODE_ENV !== "production";

/** A pooled connection the network, NAT or the hosted pooler dropped while it sat idle. */
export function isDroppedConnection(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code && ["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED", "57P01", "57P02", "57P03", "08006", "08003", "08001"].includes(e.code)) return true;
  return /Connection terminated|terminated unexpectedly|Client has encountered a connection error|timeout exceeded when trying to connect|socket hang up/i.test(e.message ?? "");
}

/** Read-only statements, safe to run again: a retry can never save anything twice. */
export function isReadOnly(text: string): boolean {
  return /^\s*(select|with\s[\s\S]*?\)\s*select)\b/i.test(text) && !/\b(insert|update|delete|for\s+update)\b/i.test(text);
}

/**
 * A query on a connection that died while idle fails once even though the database is fine. Re-run READ-ONLY
 * statements once on a fresh connection; writes are never retried (they might already have been applied).
 */
function retryDroppedReads(pool: pg.Pool) {
  const query = pool.query.bind(pool) as (...a: unknown[]) => Promise<unknown>;
  (pool as unknown as { query: (...a: unknown[]) => Promise<unknown> }).query = async (...args: unknown[]) => {
    try {
      return await query(...args);
    } catch (err) {
      const first = args[0] as string | { text?: string };
      const text = typeof first === "string" ? first : first?.text ?? "";
      if (typeof args.at(-1) === "function" || !isDroppedConnection(err) || !isReadOnly(text)) throw err;
      log("warn", "db.retry_dropped_read", { message: (err as Error).message });
      return query(...args);
    }
  };
}

async function create(): Promise<Db> {
  const url = forceEmbedded() ? undefined : process.env.DATABASE_URL;
  if (url) {
    const pool = new pg.Pool(pgPoolOptions(url, Number(process.env.DATABASE_POOL_MAX ?? 10)));
    // An idle pooled connection closed by the server or pooler emits "error" on the pool. Without a listener
    // Node treats that as an uncaught exception and the process exits; the pool already drops the dead client.
    pool.on("error", (err) => log("warn", "db.idle_client_error", { message: err.message }));
    retryDroppedReads(pool);
    return drizzlePg(pool, { schema }) as unknown as Db;
  }
  if (process.env.NODE_ENV === "production" && process.env.AVSAR_ALLOW_EMBEDDED_DB !== "1") {
    throw new Error("DATABASE_URL is required in production (the embedded database is for local development only).");
  }
  const dir = embeddedDbDir();
  mkdirSync(path.dirname(dir), { recursive: true }); // PGlite doesn't create parent directories
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export function getDb(): Promise<Db> {
  globalThis.__avsarDb ??= create().catch((err) => {
    globalThis.__avsarDb = undefined; // allow a retry after a transient failure
    throw err;
  });
  return globalThis.__avsarDb;
}

/** Fresh in-memory database with every migration applied (tests). */
export async function createMemoryDb(): Promise<Db> {
  const db = drizzlePglite(new PGlite(), { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return db;
}
