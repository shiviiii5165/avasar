/**
 * Decides whether a database restore may run. Pure function (no I/O) so it can be tested exhaustively.
 * A restore REPLACES data, so every condition must hold:
 *  1. AVSAR_ENV is explicitly "staging", "test" or "development" (unset, "production" or anything else is refused), and
 *     NODE_ENV is not "production".
 *  2. The target host is on AVSAR_RESTORE_ALLOWED_HOSTS (exact, comma-separated). Unknown hosts are refused.
 *  3. The target host is not AVSAR_PRODUCTION_DB_HOST (when that is set, it always wins, even if also allow-listed).
 *  4. The operator typed the exact host and database name: --confirm-host=<host> --confirm-database=<db>.
 * Production recovery does not use this script: it uses the provider's point-in-time restore into a new database.
 */
export interface RestoreDecision { ok: boolean; reason: string; host?: string; database?: string }

const ALLOWED_ENVS = new Set(["staging", "test", "development"]);

export function parseTarget(url: string | undefined): { host: string; database: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (!u.hostname || !database) return null;
    return { host: u.hostname.toLowerCase(), database };
  } catch {
    return null;
  }
}

export function checkRestoreTarget(input: { databaseUrl: string | undefined; env: Record<string, string | undefined>; argv: string[] }): RestoreDecision {
  const { env, argv } = input;
  const flag = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const appEnv = (env.AVSAR_ENV ?? "").trim().toLowerCase();
  if (env.NODE_ENV === "production") return { ok: false, reason: "NODE_ENV=production: restores never run in a production process." };
  if (!ALLOWED_ENVS.has(appEnv)) return { ok: false, reason: `AVSAR_ENV must be staging, test or development (got "${appEnv || "unset"}").` };

  const target = parseTarget(input.databaseUrl);
  if (!target) return { ok: false, reason: "DATABASE_URL is missing or not a postgres:// URL with a database name." };

  const prodHost = env.AVSAR_PRODUCTION_DB_HOST?.trim().toLowerCase();
  if (prodHost && target.host === prodHost) return { ok: false, reason: "Target is the production database host.", ...target };

  const allowed = (env.AVSAR_RESTORE_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) return { ok: false, reason: "AVSAR_RESTORE_ALLOWED_HOSTS is not set: no restore target is approved.", ...target };
  if (!allowed.includes(target.host)) return { ok: false, reason: `Host ${target.host} is not an approved restore target.`, ...target };

  if (flag("confirm-host") !== target.host || flag("confirm-database") !== target.database) {
    return { ok: false, reason: `Confirm the exact target: --confirm-host=${target.host} --confirm-database=${target.database}`, ...target };
  }
  return { ok: true, reason: "Approved non-production restore target.", ...target };
}
