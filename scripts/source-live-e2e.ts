/**
 * LIVE end-to-end (network + throwaway in-memory database; touches no real database): `npm run sources:e2e`.
 * Approves the known employer boards in the scratch DB, runs two scheduled passes, and reports what was imported.
 */
import { eq, sql } from "drizzle-orm";

import { upsertIdentity } from "../src/server/auth/identity";
import { createMemoryDb } from "../src/server/db/client";
import { opportunities, opportunitySources } from "../src/server/db/schema";
import { ensureSourceRegistry, runScheduledIngestion } from "../src/server/services/ingestion";
import { setSourcePermission } from "../src/server/services/verification";

async function main() {
  const db = await createMemoryDb();
  const admin = await upsertIdentity(db, { provider: "dev", subject: "e2e-admin", email: null, emailVerified: false, name: "E2E" });
  await ensureSourceRegistry(db);
  for (const s of await db.select().from(opportunitySources)) {
    if (!s.adapterKey?.includes(":")) continue;
    await setSourcePermission(db, s.id, "approved_collection", { reviewerId: admin.id, evidence: "Scratch e2e test: employer's public job board" });
    await db.update(opportunitySources).set({ active: true, nextRunAt: null }).where(eq(opportunitySources.id, s.id));
  }
  for (const pass of [1, 2]) {
    if (pass === 2) await db.update(opportunitySources).set({ nextRunAt: null }).where(eq(opportunitySources.active, true));
    const t = Date.now();
    const r = await runScheduledIngestion(db, { budgetMs: 600_000, maxSources: 50 });
    const sum = r.sources.reduce((a, x) => ({ collected: a.collected + x.collected, created: a.created + x.created, updated: a.updated + x.updated, duplicates: a.duplicates + x.duplicates, rejected: a.rejected + x.rejected }), { collected: 0, created: 0, updated: 0, duplicates: 0, rejected: 0 });
    console.log(`pass ${pass}: ${r.sources.length} sources, statuses ${JSON.stringify(r.sources.map((x) => x.status))}, ${JSON.stringify(sum)}, ${Math.round((Date.now() - t) / 1000)}s`);
  }
  const byType = await db.select({ c: opportunities.category, s: opportunities.status, n: sql<number>`count(*)::int` }).from(opportunities).groupBy(opportunities.category, opportunities.status);
  console.log("opportunities in scratch DB:", JSON.stringify(byType));
  const flagged = await db.select({ n: sql<number>`count(*)::int` }).from(opportunities).where(sql`cardinality(${opportunities.contentFlags}) > 0`);
  console.log("flagged by injection heuristics:", flagged[0].n);
  process.exit(0);
}
main();
