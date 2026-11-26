import { describe, expect, it } from "vitest";

import { SnapshotCache } from "./snapshot-cache";

function setup(ttl = 1000) {
  let t = 0;
  const cache = new SnapshotCache<object, number>(ttl, () => t);
  let loads = 0;
  const load = () => Promise.resolve(++loads);
  return { cache, load, owner: {}, tick: (ms: number) => (t += ms), loads: () => loads };
}

describe("SnapshotCache", () => {
  it("shares one load between concurrent callers (single-flight)", async () => {
    const { cache, owner, loads } = setup();
    let release!: (v: number) => void;
    const slow = () => new Promise<number>((r) => (release = r));
    const all = Promise.all(Array.from({ length: 100 }, () => cache.get(owner, "k", slow)));
    release(7);
    expect(await all).toEqual(Array(100).fill(7));
    expect(loads()).toBe(0); // only the slow loader ran, once
  });

  it("reuses a value within the TTL and reloads after it", async () => {
    const { cache, owner, load, tick } = setup(1000);
    expect(await cache.get(owner, "k", load)).toBe(1);
    tick(999);
    expect(await cache.get(owner, "k", load)).toBe(1);
    tick(1);
    expect(await cache.get(owner, "k", load)).toBe(2);
  });

  it("invalidate() forces the next read to load fresh data, including over a load in flight", async () => {
    const { cache, owner, load } = setup();
    expect(await cache.get(owner, "k", load)).toBe(1);
    cache.invalidate();
    expect(await cache.get(owner, "k", load)).toBe(2);
    // A write lands while a load is running: that load's result must not be kept.
    const inFlight = cache.get(owner, "k2", load);
    cache.invalidate();
    await inFlight;
    expect(await cache.get(owner, "k2", load)).toBe(4);
  });

  it("never caches a failure", async () => {
    const { cache, owner, load } = setup();
    await expect(cache.get(owner, "k", () => Promise.reject(new Error("db down")))).rejects.toThrow("db down");
    expect(await cache.get(owner, "k", load)).toBe(1);
  });

  it("keeps separate owners and keys apart", async () => {
    const { cache, load } = setup();
    const a = {};
    const b = {};
    expect(await cache.get(a, "k", load)).toBe(1);
    expect(await cache.get(b, "k", load)).toBe(2);
    expect(await cache.get(a, "other", load)).toBe(3);
    expect(await cache.get(a, "k", load)).toBe(1);
  });
});
