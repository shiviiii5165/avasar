/**
 * LIVE source smoke test (network, no database): `npm run sources:smoke`.
 * For each known employer job board, fetches the real public API through the same SSRF-safe fetcher and
 * normalizer the pipeline uses, and prints what would be collected. Writes nothing anywhere.
 */
import { adapterFor, boundGetter } from "../src/server/ingestion/adapters";
import { KNOWN_BOARDS } from "../src/server/ingestion/ats";
import { normalizeListing } from "../src/server/ingestion/normalize";
import { curatedRegistry } from "../src/server/intelligence/registry";

async function main() {
  const reg = curatedRegistry();
  const now = new Date();
  let total = 0;
  let valid = 0;
  for (const b of KNOWN_BOARDS) {
    const a = adapterFor(b.family)!;
    const key = `${b.family}:${b.id}`;
    try {
      const get = boundGetter(a, a.allowedHosts({ sourceUrl: null, env: {} }));
      const r = await a.collect!({ sourceUrl: null, sourceName: b.employer, adapterKey: key, env: {}, get });
      const norm = r.records.map((x) => normalizeListing(x, { supportedTypes: a.supportedTypes, registry: reg, now }));
      const ok = norm.filter((n) => n.ok);
      const types = ok.reduce<Record<string, number>>((m, n) => (n.ok ? ((m[n.listing.type] = (m[n.listing.type] ?? 0) + 1), m) : m), {});
      const reasons = [...new Set(norm.flatMap((n) => (n.ok ? [] : n.issues)))].slice(0, 2);
      total += r.records.length;
      valid += ok.length;
      const sample = ok[0]?.ok ? ` e.g. "${ok[0].listing.title}" (${ok[0].listing.locations.join(", ")})` : "";
      console.log(`${key.padEnd(40)} india=${String(r.records.length).padStart(4)} valid=${String(ok.length).padStart(4)} ${JSON.stringify(types)}${reasons.length ? ` rejected: ${reasons.join("; ")}` : ""}${sample}`);
    } catch (err) {
      console.log(`${key.padEnd(40)} FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\nTOTAL India-relevant records: ${total}, valid after normalization: ${valid}`);
}
main();
