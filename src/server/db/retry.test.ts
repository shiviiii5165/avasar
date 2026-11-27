import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { isDroppedConnection, isReadOnly } = await import("./client");

describe("dropped-connection read retry", () => {
  it("recognises connections dropped while idle", () => {
    expect(isDroppedConnection(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isDroppedConnection(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }))).toBe(true);
    expect(isDroppedConnection(Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }))).toBe(true);
    expect(isDroppedConnection(Object.assign(new Error('relation "x" does not exist'), { code: "42P01" }))).toBe(false);
  });

  it("retries only read-only statements, never writes", () => {
    expect(isReadOnly('select "sessions"."id" from "sessions" where "token_hash" = $1')).toBe(true);
    expect(isReadOnly("with t as (select 1) select * from t")).toBe(true);
    expect(isReadOnly('insert into "sessions" values ($1)')).toBe(false);
    expect(isReadOnly('update "sessions" set "last_seen_at" = now()')).toBe(false);
    expect(isReadOnly('delete from "saved" where id = $1')).toBe(false);
    expect(isReadOnly("select * from jobs for update skip locked")).toBe(false);
    expect(isReadOnly("with d as (delete from x returning id) select * from d")).toBe(false);
  });
});
