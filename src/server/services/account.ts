import "server-only";

import { eq } from "drizzle-orm";

import { audit } from "../audit";
import type { Db } from "../db/client";
import { sessions, userIdentities } from "../db/schema";
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
