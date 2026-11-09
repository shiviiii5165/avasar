/**
 * Database CLI (run with tsx):
 *   npm run db:migrate   apply migrations (DATABASE_URL, or the local embedded database)
 *   npm run db:seed      insert SAMPLE data (refuses in production)
 * Prints no connection strings or secrets.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";

import * as schema from "../src/server/db/schema";
import { embeddedDbDir, type Db } from "../src/server/db/client";
import { pgPoolOptions } from "../src/server/db/pg-options";
import { seedSamples } from "../src/server/seed";

const MIGRATIONS = path.join(process.cwd(), "src/server/db/migrations");

async function main() {
  const cmd = process.argv[2];
  let db: Db;
  let close: () => Promise<void>;
  const useEmbedded = process.env.AVSAR_EMBEDDED_DB === "1" || !process.env.DATABASE_URL;
  if (!useEmbedded && process.env.DATABASE_URL) {
    const pool = new pg.Pool(pgPoolOptions(process.env.DATABASE_URL, 2));
    const d = drizzlePg(pool, { schema });
    await migratePg(d, { migrationsFolder: MIGRATIONS });
    db = d as unknown as Db;
    close = () => pool.end();
    console.log("Migrations applied (PostgreSQL).");
  } else {
    mkdirSync(path.dirname(embeddedDbDir()), { recursive: true }); // PGlite doesn't create parent directories
    const client = new PGlite(embeddedDbDir());
    const d = drizzlePglite(client, { schema });
    await migratePglite(d, { migrationsFolder: MIGRATIONS });
    db = d;
    close = () => client.close();
    console.log("Migrations applied (embedded development database).");
  }
  if (cmd === "seed") console.log("Sample data:", await seedSamples(db));
  await close();
}

main().catch((err) => {
  // Drizzle wraps driver errors; show the underlying cause too (never connection strings).
  console.error(err instanceof Error ? err.message : err);
  const cause = err instanceof Error ? (err.cause as Error | undefined) : undefined;
  if (cause) console.error("Cause:", cause.message ?? cause);
  process.exit(1);
});
