import { describe, expect, it } from "vitest";

import { DEFAULT_POOL_IDLE_MS, pgPoolOptions } from "./pg-options";

const REMOTE = "postgresql://u:p@aws-0-ap-south-1.pooler.example.com:6543/postgres?sslmode=require";

describe("database pool options", () => {
  it("keeps idle connections long enough to outlast reading a page (regression: 10 s default reconnected on most clicks)", () => {
    const o = pgPoolOptions(REMOTE, 10, {});
    expect(o.idleTimeoutMillis).toBe(DEFAULT_POOL_IDLE_MS);
    expect(DEFAULT_POOL_IDLE_MS).toBeGreaterThanOrEqual(60_000);
    expect(o.keepAlive).toBe(true);
    expect(o.max).toBe(10);
  });

  it("accepts an explicit idle timeout, including 0, and ignores invalid values", () => {
    expect(pgPoolOptions(REMOTE, 5, { DATABASE_POOL_IDLE_MS: "30000" }).idleTimeoutMillis).toBe(30_000);
    expect(pgPoolOptions(REMOTE, 5, { DATABASE_POOL_IDLE_MS: "0" }).idleTimeoutMillis).toBe(0);
    expect(pgPoolOptions(REMOTE, 5, { DATABASE_POOL_IDLE_MS: "soon" }).idleTimeoutMillis).toBe(DEFAULT_POOL_IDLE_MS);
    expect(pgPoolOptions(REMOTE, 5, { DATABASE_POOL_IDLE_MS: "-5" }).idleTimeoutMillis).toBe(DEFAULT_POOL_IDLE_MS);
    expect(pgPoolOptions(REMOTE, 5, { DATABASE_POOL_IDLE_MS: " " }).idleTimeoutMillis).toBe(DEFAULT_POOL_IDLE_MS);
  });

  it("still uses TLS for hosted databases, plain for localhost, and strips sslmode from the URL", () => {
    const remote = pgPoolOptions(REMOTE, 10, {});
    expect(remote.ssl).toEqual({ rejectUnauthorized: false });
    expect(remote.connectionString).not.toContain("sslmode");
    expect(pgPoolOptions("postgres://u:p@localhost:5432/db", 10, {}).ssl).toBeUndefined();
    expect(pgPoolOptions(REMOTE, 10, { DATABASE_SSL: "0" }).ssl).toBeUndefined();
  });
});
