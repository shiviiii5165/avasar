import type { PoolConfig } from "pg";

/**
 * node-postgres options for DATABASE_URL. Hosted Postgres (Supabase) needs TLS; localhost stays plain.
 * Any sslmode in the URL is removed: pg lets it override `ssl` (treating it as verify-full) and warns.
 */
export function pgPoolOptions(url: string, max: number): PoolConfig {
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
  return {
    connectionString,
    max,
    ssl: local || process.env.DATABASE_SSL === "0" ? undefined : { rejectUnauthorized: false },
  };
}
