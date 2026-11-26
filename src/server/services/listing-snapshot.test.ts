import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { createMemoryDb, type Db } from "../db/client";
import { opportunities } from "../db/schema";
import { upsertIdentity } from "../auth/identity";
import { createOpportunity, listOpenOpportunities, transitionOpportunity } from "./opportunities";
import { invalidateOpenListings } from "./listing-snapshot";

/** The production snapshot of open listings: shared reads, instant visibility of reviewed changes, deadlines re-checked. */
let db: Db;
let adminId: string;

async function listing(title: string, deadline: Date | null = null) {
  const o = await createOpportunity(db, {
    title, category: "job", organizationName: "Snapshot Org", description: "A fixture listing used by the snapshot test. ".repeat(3),
    workMode: "remote", applicationMethod: "internal", locations: "", requiredSkills: "SQL", preferredSkills: "",
    educationLevels: [], requiresWorkAuthorizationIndia: false, unpaid: false, conversionPossible: false,
  }, adminId);
  await db.update(opportunities).set({ status: "published", publishedAt: new Date(), deadline }).where(eq(opportunities.id, o.id));
  return o.id;
}

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production");
  db = await createMemoryDb();
  adminId = (await upsertIdentity(db, { provider: "dev", subject: "snap-admin", email: null, emailVerified: false, name: "Admin" })).id;
});
afterAll(() => {
  vi.unstubAllEnvs();
  invalidateOpenListings();
});

describe("open-listing snapshot (production)", () => {
  it("serves concurrent readers from one load and hides a listing the moment it is paused", async () => {
    const a = await listing("Snapshot analyst A");
    await listing("Snapshot analyst B");
    invalidateOpenListings();
    const reads = await Promise.all(Array.from({ length: 20 }, () => listOpenOpportunities(db)));
    expect(reads[0].map((o) => o.id)).toHaveLength(2);
    // All readers got the same shared rows (one query), not 20 copies.
    for (const r of reads) expect(r[0]).toBe(reads[0][0]);

    await transitionOpportunity(db, a, "paused", adminId, "test");
    expect((await listOpenOpportunities(db)).map((o) => o.id)).not.toContain(a);
  });

  it("drops a listing whose deadline passed after the snapshot was taken", async () => {
    const soon = await listing("Closes soon", new Date(Date.now() + 60_000));
    invalidateOpenListings();
    expect((await listOpenOpportunities(db)).map((o) => o.id)).toContain(soon);
    expect((await listOpenOpportunities(db, undefined, new Date(Date.now() + 120_000))).map((o) => o.id)).not.toContain(soon);
  });

  it("can be switched off (AVSAR_LISTING_CACHE=0): every read goes to the database", async () => {
    vi.stubEnv("AVSAR_LISTING_CACHE", "0");
    const first = await listOpenOpportunities(db);
    const second = await listOpenOpportunities(db);
    expect(second[0]).not.toBe(first[0]);
    vi.stubEnv("AVSAR_LISTING_CACHE", "");
  });
});
