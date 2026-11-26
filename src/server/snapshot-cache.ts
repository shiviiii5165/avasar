/**
 * Shared, short-lived snapshot of an expensive read (e.g. every open listing with its skills), per server instance.
 *
 * Why: every student page needs ALL open listings to rank them. Without sharing, N concurrent students mean N
 * identical full-catalogue queries; with it, one query per instance per TTL, however many students arrive.
 *  - Single-flight: concurrent misses share ONE in-flight load (no thundering herd when the TTL expires).
 *  - Bounded staleness: a value is reused for at most `ttlMs`; invalidate() drops everything at once (writes call it).
 *  - Failures are never cached: the next caller retries.
 *  - Keyed by owner object (the database handle) via WeakMap, so separate databases never share or leak entries.
 */
interface Entry<V> {
  at: number;
  gen: number;
  value?: V;
  pending?: Promise<V>;
}

export class SnapshotCache<O extends object, V> {
  private entries = new WeakMap<O, Map<string, Entry<V>>>();
  private generation = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  get(owner: O, key: string, load: () => Promise<V>): Promise<V> {
    let byKey = this.entries.get(owner);
    if (!byKey) this.entries.set(owner, (byKey = new Map()));
    const hit = byKey.get(key);
    const now = this.clock();
    if (hit && hit.gen === this.generation) {
      if (hit.pending) return hit.pending;
      if (hit.value !== undefined && now - hit.at < this.ttlMs) return Promise.resolve(hit.value);
    }
    const gen = this.generation;
    const entry: Entry<V> = { at: now, gen };
    const map = byKey;
    entry.pending = load().then(
      (value) => {
        // Keep it only if nothing was invalidated while loading (a write during the load may not be in this value).
        if (this.generation === gen && map.get(key) === entry) Object.assign(entry, { value, pending: undefined, at: this.clock() });
        else if (map.get(key) === entry) map.delete(key);
        return value;
      },
      (err) => {
        if (map.get(key) === entry) map.delete(key);
        throw err;
      },
    );
    map.set(key, entry);
    return entry.pending;
  }

  /** Drop every snapshot (call after any write that changes what the snapshot would contain). */
  invalidate(): void {
    this.generation++;
  }
}
