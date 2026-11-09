/**
 * Logical backup and restore of Avsar's own PostgreSQL database (complements the managed provider's automated
 * snapshots / point-in-time recovery). Requires PostgreSQL client tools (pg_dump, pg_restore) matching the server's
 * major version.
 *
 *   npm run db:backup
 *     → backups/avsar-<timestamp>.dump (custom format) + .sha256; the archive is verified with `pg_restore --list`.
 *   npm run db:restore -- <file.dump> --confirm-host=<host> --confirm-database=<db>
 *     → restores into DATABASE_URL only if src/server/ops/restore-guard.ts approves the target (non-production
 *       AVSAR_ENV, host on AVSAR_RESTORE_ALLOWED_HOSTS, not AVSAR_PRODUCTION_DB_HOST, exact typed confirmation) and the
 *       archive's checksum matches.
 *
 * Reads DATABASE_URL from the environment; never prints it.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { checkRestoreTarget, parseTarget } from "../src/server/ops/restore-guard";

const [cmd, file, ...rest] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
const fail = (msg: string): never => { console.error(msg); process.exit(1); };
const run = (bin: string, args: string[], capture = false) => {
  const r = spawnSync(bin, args, { stdio: capture ? ["ignore", "pipe", "inherit"] : ["ignore", "inherit", "inherit"], env: { ...process.env, PGCONNECT_TIMEOUT: "10" }, encoding: "utf8" });
  if (r.error) fail(`${bin} is not available: install the PostgreSQL client tools (same major version as the server).`);
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r.stdout ?? "";
};
const sha256 = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

if (!url) fail("DATABASE_URL is not set. Backups apply to a real PostgreSQL database, not the embedded development one.");

if (cmd === "backup") {
  const target = parseTarget(url) ?? fail("DATABASE_URL is not a postgres:// URL with a database name.");
  mkdirSync("backups", { recursive: true });
  const out = path.join("backups", `avsar-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);
  run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${out}`, `--dbname=${url}`]);
  const listing = run("pg_restore", ["--list", out], true); // integrity: the archive must be readable
  const tables = (listing.match(/ TABLE DATA /g) ?? []).length;
  if (!tables) fail(`Backup ${out} contains no table data; treat it as failed.`);
  writeFileSync(`${out}.sha256`, `${sha256(out)}  ${path.basename(out)}\n`);
  console.log(`Backup written: ${out} (${Math.round(statSync(out).size / 1024)} KB, ${tables} tables, database ${target.database}). Store it encrypted and off-host; it contains personal data.`);
} else if (cmd === "restore") {
  if (!file) fail("Usage: npm run db:restore -- <file.dump> --confirm-host=<host> --confirm-database=<db>");
  const decision = checkRestoreTarget({ databaseUrl: url, env: process.env, argv: rest });
  if (!decision.ok) fail(`Refusing to restore: ${decision.reason}`);
  if (!existsSync(file)) fail(`Backup file not found: ${file}`);
  const sidecar = `${file}.sha256`;
  if (!existsSync(sidecar)) fail(`Missing checksum file ${sidecar}; refusing to restore an unverified archive.`);
  if (readFileSync(sidecar, "utf8").split(/\s+/)[0] !== sha256(file)) fail("Checksum mismatch: the backup file is corrupted or was changed.");
  run("pg_restore", ["--list", file], true);
  run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", `--dbname=${url}`, file]);
  console.log(`Restored into ${decision.host}/${decision.database}. Run \`npm run db:migrate\` for newer migrations, then check /api/health.`);
} else {
  fail("Usage: db-backup backup | restore <file> --confirm-host=<host> --confirm-database=<db>");
}
