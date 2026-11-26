import type { Db } from "../db/client";
import { SnapshotCache } from "../snapshot-cache";
import type { OpportunityFull } from "./opportunities";

/**
 * Shared snapshot of the open catalogue (see server/snapshot-cache.ts). Every student page ranks ALL open listings, so
 * without it each page view is a full-catalogue query; with it, one query per server instance per LISTING_TTL_MS,
 * however many students are online. On only in production builds (tests and `next dev` always read the database);
 * AVSAR_LISTING_CACHE=0 turns it off. Writers that change what students see call invalidateOpenListings(); anything
 * else is covered by the short TTL, and deadlines are re-checked on every read so a closed listing is never shown.
 * Its own module (types only) so writers anywhere can invalidate without an import cycle.
 */
export const LISTING_TTL_MS = 30_000;
export const openListings = new SnapshotCache<Db, OpportunityFull[]>(LISTING_TTL_MS);
export const listingCacheOn = () => process.env.NODE_ENV === "production" && process.env.AVSAR_LISTING_CACHE !== "0";

/** Drop the shared open-listing snapshot (call after a write that changes what students can see). */
export function invalidateOpenListings(): void {
  openListings.invalidate();
}
