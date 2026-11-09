/**
 * Logical backup and restore of Avsar's own PostgreSQL database (complements the managed provider's
 * automated snapshots / point-in-time recovery). Requires PostgreSQL client tools (pg_dump, pg_restore).
 *
 *   npm run db:backup                         → backups/avsar-<timestamp>.dump (custom format, compressed)
 *   npm run db:restore -- <file> --confirm    → restores into DATABASE_URL (refuses production unless
 *                                               AVSAR_ALLOW_RESTORE=1 is set deliberately)
 *
 * Reads DATABASE_URL from the environment; never prints it. Use a staging database to test restores.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";

const [cmd, file, ...flags] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Backups apply to a real PostgreSQL database, not the embedded development one.");
  process.exit(1);
}
const run = (bin, args) => {
  const r = spawnSync(bin, args, { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, PGCONNECT_TIMEOUT: "10" } });
  if (r.error) { console.error(`${bin} is not available: install the PostgreSQL client tools.`); process.exit(1); }
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (cmd === "backup") {
  mkdirSync("backups", { recursive: true });
  const out = path.join("backups", `avsar-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);
  run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${out}`, `--dbname=${url}`]);
  console.log(`Backup written: ${out} (${Math.round(statSync(out).size / 1024)} KB). Store it encrypted and off-host; it contains personal data.`);
} else if (cmd === "restore") {
  if (!file || !flags.includes("--confirm")) {
    console.error("Usage: npm run db:restore -- <file.dump> --confirm   (this REPLACES data in the target database)");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && process.env.AVSAR_ALLOW_RESTORE !== "1") {
    console.error("Refusing to restore into production. Restore into staging and verify first; set AVSAR_ALLOW_RESTORE=1 only during an approved recovery.");
    process.exit(1);
  }
  run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", `--dbname=${url}`, file]);
  console.log("Restore finished. Run `npm run db:migrate` to apply any newer migrations, then check /api/health.");
} else {
  console.error("Usage: node scripts/db-backup.mjs backup | restore <file> --confirm");
  process.exit(1);
}
