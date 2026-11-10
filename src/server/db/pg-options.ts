import type { PoolConfig } from "pg";

/**
 * How long an unused pooled connection is kept open. node-postgres closes idle connections after 10 s by default,
 * which is shorter than a person spends reading one page: almost every click then paid a new TCP + TLS + login
 * handshake to the hosted database (several network round trips per connection, before any query ran).
 * Override with DATABASE_POOL_IDLE_MS (0 keeps connections until the server closes them).
 */
export const DEFAULT_POOL_IDLE_MS = 5 * 60 * 1000;

/**
 * node-postgres options for DATABASE_URL. Hosted Postgres (Supabase) needs TLS; localhost stays plain.
 * Any sslmode in the URL is removed: pg lets it override `ssl` (treating it as verify-full) and warns.
 */
export function pgPoolOptions(url: string, max: number, env: Record<string, string | undefined> = process.env): PoolConfig {
  const local = /localhost|127\.0\.0\.1/.test(url);
  let connectionString = url;
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("uselibpqcompat");
    connectionString = u.toString();
  } catch {
    // keep the raw string; pg reports a malformed URL itself
  }
  const idle = Number(env.DATABASE_POOL_IDLE_MS);
  return {
    connectionString,
    max,
    ssl: local || env.DATABASE_SSL === "0" ? undefined : { rejectUnauthorized: false },
    idleTimeoutMillis: env.DATABASE_POOL_IDLE_MS?.trim() && Number.isFinite(idle) && idle >= 0 ? idle : DEFAULT_POOL_IDLE_MS,
    // Long-lived idle sockets: let the OS detect dead peers (NAT/pooler drops) instead of failing the next query.
    keepAlive: true,
  };
}
