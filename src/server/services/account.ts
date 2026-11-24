import "server-only";

import { eq } from "drizzle-orm";

import { audit } from "../audit";
import type { Db } from "../db/client";
import { adminRoles, analyticsEvents, dismissedOpportunities, notificationPreferences, notifications, recentlyViewed, savedOpportunities, savedSearches, sessions, userIdentities } from "../db/schema";
import { isMissingTable } from "./engagement";
import { eraseCandidateData } from "./profiles";

/**
 * Account deletion, one path for both triggers: the student deleting their Avsar account, and AI Tathastu
 * reporting that the account it signs into was deleted. Erases profile data (eraseCandidateData), marks the
 * identity deleted with its email and name removed, and revokes every session. The (provider, subject) row
 * stays, minimized, so a late event for this subject can never recreate a profile; applications already sent
 * stay with the organization as submitted. Returns storage keys the caller removes after the transaction.
 * Idempotent: deleting an already deleted account changes nothing further.
 */
export async function deleteCandidateAccount(
  db: Db,
  input: { identityId: string; profileId: string | null; actor: { id: string | null; role: "candidate" | "system" }; reason: string },
): Promise<string[]> {
  const keys = input.profileId ? await eraseCandidateData(db, input.profileId) : [];
  await db.transaction(async (tx) => {
    await tx.update(userIdentities).set({ deletedAt: new Date(), email: null, name: null }).where(eq(userIdentities.id, input.identityId));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.identityId, input.identityId));
    // Personal activity tied to the account (searches can hold what the student typed). Removed, not kept on the
    // minimized row. Admin roles go too. Organization memberships stay so an organization is never left ownerless.
    for (const t of [savedOpportunities, savedSearches, recentlyViewed, notifications, notificationPreferences, adminRoles]) {
      await tx.delete(t).where(eq(t.identityId, input.identityId));
    }
    // In a savepoint: before migration 0012 the table doesn't exist, and that must not abort the deletion.
    await tx.transaction((sp) => sp.delete(dismissedOpportunities).where(eq(dismissedOpportunities.identityId, input.identityId))).catch((err) => {
      if (!isMissingTable(err)) throw err;
    });
    await tx.update(analyticsEvents).set({ identityId: null }).where(eq(analyticsEvents.identityId, input.identityId));
    await audit(tx, {
      actorId: input.actor.id,
      actorRole: input.actor.role,
      action: "account.delete",
      targetType: "identity",
      targetId: input.identityId,
      metadata: { reason: input.reason },
    });
  });
  return keys;
}
