import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createMemoryDb, type Db } from "../db/client";
import { opportunities } from "../db/schema";
import { upsertIdentity } from "../auth/identity";
import { rankForBrowse } from "../domain/recommend";
import type { CandidateFacts } from "../domain/types";
import { candidateFactsFor } from "./candidate-context";
import { createOpportunity, listOpenOpportunities, PAGE_SIZE, RANK_LIMIT, rankedPage, searchOpportunities, searchOpportunitiesRanked, searchSchema, toFacts, type OpportunityFull } from "./opportunities";
import { ensureProfile, replaceSkills } from "./profiles";

/**
 * Best match must rank the whole filtered set before paging. Fixture: 13 open jobs. The 12 newest ask for a
 * skill the candidate lacks; the OLDEST asks for one they have, so by date it is alone on page 2.
 */
let db: Db;
let facts: CandidateFacts;
const rank = (list: OpportunityFull[]) => rankForBrowse(facts, list.map((o) => ({ id: o.id, item: o, facts: toFacts(o) }))).map((r) => r.item);

async function publish(title: string, opts: { skill: string; daysAgo: number; educationLevels?: ("bachelors" | "masters")[] }, adminId: string) {
  const o = await createOpportunity(db, {
    title, category: "job", organizationName: "Fixture Org", description: "A fixture listing used by the ranking test. ".repeat(3),
    workMode: "remote", applicationMethod: "internal", locations: "", requiredSkills: opts.skill, preferredSkills: "",
    educationLevels: opts.educationLevels ?? [], requiresWorkAuthorizationIndia: false, unpaid: false, conversionPossible: false,
  }, adminId);
  await db.update(opportunities).set({ status: "published", publishedAt: new Date(Date.now() - opts.daysAgo * 86_400_000) }).where(eq(opportunities.id, o.id));
  return o.id;
}

let strongId: string;
let unknownEligibilityId: string;

beforeAll(async () => {
  db = await createMemoryDb();
  const admin = await upsertIdentity(db, { provider: "dev", subject: "rank-admin", email: null, emailVerified: false, name: "Admin" });
  for (let i = 0; i < 11; i++) await publish(`Weak match ${i}`, { skill: "COBOL", daysAgo: i + 1 }, admin.id);
  // Requires an education level the candidate hasn't stated: unknown eligibility, never an automatic rejection.
  unknownEligibilityId = await publish("Unknown eligibility role", { skill: "COBOL", daysAgo: 12, educationLevels: ["masters"] }, admin.id);
  strongId = await publish("Strong match (oldest)", { skill: "Rust", daysAgo: 30 }, admin.id);

  const cand = await upsertIdentity(db, { provider: "dev", subject: "rank-cand", email: null, emailVerified: false, name: "Cand" });
  const profile = await ensureProfile(db, cand.id, "Cand");
  await replaceSkills(db, profile!.id, ["Rust"]);
  facts = (await candidateFactsFor(db, profile!.id))!;
});

describe("best-match ranking across pages", () => {
  it("fixture: by date the strong match is on page 2", async () => {
    const page1 = await searchOpportunities(db, searchSchema.parse({}));
    expect(page1.total).toBe(13);
    expect(page1.items).toHaveLength(PAGE_SIZE);
    expect(page1.items.map((o) => o.id)).not.toContain(strongId);
    // The old behaviour (rank one fetched page) can never surface it.
    expect(rank(page1.items).map((o) => o.id)).not.toContain(strongId);
  });

  it("ranks the whole set first: the page-2-by-date match leads page 1", async () => {
    const page1 = await searchOpportunitiesRanked(db, searchSchema.parse({}), rank);
    expect(page1.items[0].id).toBe(strongId);
    expect(page1.total).toBe(13);
    expect(page1.pageCount).toBe(2);
    expect(page1.truncated).toBe(false);
  });

  it("paginates the ranked order without gaps or duplicates", async () => {
    const p1 = await searchOpportunitiesRanked(db, searchSchema.parse({ page: 1 }), rank);
    const p2 = await searchOpportunitiesRanked(db, searchSchema.parse({ page: 2 }), rank);
    expect(p1.items).toHaveLength(PAGE_SIZE);
    expect(p2.items).toHaveLength(1);
    const ids = [...p1.items, ...p2.items].map((o) => o.id);
    expect(new Set(ids).size).toBe(13);
  });

  it("is stable for the same inputs", async () => {
    const a = await searchOpportunitiesRanked(db, searchSchema.parse({}), rank);
    const b = await searchOpportunitiesRanked(db, searchSchema.parse({}), rank);
    expect(a.items.map((o) => o.id)).toEqual(b.items.map((o) => o.id));
  });

  it("applies the same filters as the date-sorted search", async () => {
    const q = await searchOpportunitiesRanked(db, searchSchema.parse({ q: "Weak match" }), rank);
    expect(q.total).toBe(11);
    expect(q.items.map((o) => o.id)).not.toContain(strongId);
    const none = await searchOpportunitiesRanked(db, searchSchema.parse({ workMode: "onsite" }), rank);
    expect(none.total).toBe(0);
    expect(none.items).toEqual([]);
  });

  it("unfiltered: ranking the open listings already loaded gives exactly the database search's pages", async () => {
    // The Opportunities page reuses its open listings for the unfiltered best-match list instead of fetching them twice.
    const open = await listOpenOpportunities(db, RANK_LIMIT);
    expect(open.length).toBeLessThan(RANK_LIMIT);
    for (const page of [1, 2, 3]) {
      const fromDb = await searchOpportunitiesRanked(db, searchSchema.parse({ page }), async (list) => rank(list));
      const reused = rankedPage(rank(open), page);
      expect(reused.items.map((o) => o.id)).toEqual(fromDb.items.map((o) => o.id));
      expect({ total: reused.total, pageCount: reused.pageCount, truncated: reused.truncated }).toEqual({ total: fromDb.total, pageCount: fromDb.pageCount, truncated: fromDb.truncated });
    }
  });

  it("keeps listings with unknown eligibility (missing profile data is not a rejection)", async () => {
    const p1 = await searchOpportunitiesRanked(db, searchSchema.parse({ page: 1 }), rank);
    const p2 = await searchOpportunitiesRanked(db, searchSchema.parse({ page: 2 }), rank);
    expect([...p1.items, ...p2.items].map((o) => o.id)).toContain(unknownEligibilityId);
  });
});
