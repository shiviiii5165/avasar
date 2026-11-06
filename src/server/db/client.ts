import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";

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

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
    return drizzlePg(pool, { schema }) as unknown as Db;
  }
  if (process.env.NODE_ENV === "production" && process.env.AVSAR_ALLOW_EMBEDDED_DB !== "1") {
    throw new Error("DATABASE_URL is required in production (the embedded database is for local development only).");
  }
  const dir = path.join(process.cwd(), ".data/pglite");
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
