import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import type { Db } from "../db/client";
import { opportunities, recentlyViewed, savedOpportunities, savedSearches } from "../db/schema";
import { detailColumns, fromDetailRow, publicVisibility } from "./opportunities";

export async function toggleSaved(db: Db, identityId: string, opportunityId: string): Promise<boolean> {
  const deleted = await db.delete(savedOpportunities).where(and(eq(savedOpportunities.identityId, identityId), eq(savedOpportunities.opportunityId, opportunityId))).returning();
  if (deleted.length) return false;
  const [opp] = await db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.id, opportunityId), publicVisibility()));
  if (!opp) throw new Error("NOT_FOUND");
  await db.insert(savedOpportunities).values({ identityId, opportunityId }).onConflictDoNothing();
  return true;
}

export async function savedIds(db: Db, identityId: string): Promise<Set<string>> {
  const rows = await db.select({ id: savedOpportunities.opportunityId }).from(savedOpportunities).where(eq(savedOpportunities.identityId, identityId));
  return new Set(rows.map((r) => r.id));
}

/** Saved listings, including ones that have since closed (shown as closed, never silently dropped). */
export async function listSaved(db: Db, identityId: string) {
  // One round trip: skills and eligibility come back as columns of the same query.
  const rows = await db
    .select({ o: opportunities, ...detailColumns })
    .from(savedOpportunities)
    .innerJoin(opportunities, eq(savedOpportunities.opportunityId, opportunities.id))
    .where(eq(savedOpportunities.identityId, identityId))
    .orderBy(desc(savedOpportunities.createdAt));
  return rows.map(fromDetailRow);
}

export async function recordView(db: Db, identityId: string, opportunityId: string) {
  await db.insert(recentlyViewed).values({ identityId, opportunityId }).onConflictDoUpdate({ target: [recentlyViewed.identityId, recentlyViewed.opportunityId], set: { viewedAt: sql`now()` } });
}

export async function listRecentlyViewed(db: Db, identityId: string, limit = 5) {
  const rows = await db
    .select({ o: opportunities })
    .from(recentlyViewed)
    .innerJoin(opportunities, eq(recentlyViewed.opportunityId, opportunities.id))
    .where(and(eq(recentlyViewed.identityId, identityId), publicVisibility()))
    .orderBy(desc(recentlyViewed.viewedAt))
    .limit(limit);
  return rows.map((r) => r.o);
}

export async function saveSearch(db: Db, identityId: string, name: string, query: Record<string, string>) {
  const existing = await db.select({ id: savedSearches.id }).from(savedSearches).where(eq(savedSearches.identityId, identityId));
  if (existing.length >= 20) throw new Error("LIMIT");
  await db.insert(savedSearches).values({ identityId, name: name.slice(0, 60), query });
}

export async function listSavedSearches(db: Db, identityId: string) {
  return db.select().from(savedSearches).where(eq(savedSearches.identityId, identityId)).orderBy(desc(savedSearches.createdAt));
}

export async function deleteSavedSearch(db: Db, identityId: string, id: string) {
  await db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.identityId, identityId)));
}
