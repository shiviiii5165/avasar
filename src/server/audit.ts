import "server-only";

import type { Db } from "./db/client";
import { auditLogs } from "./db/schema";

/** Append-only audit trail for sensitive actions. Never put secrets or document contents in metadata. */
export async function audit(
  db: Pick<Db, "insert">,
  entry: { actorId: string | null; actorRole: string; action: string; targetType: string; targetId?: string | null; metadata?: Record<string, unknown> },
) {
  await db.insert(auditLogs).values({
    actorIdentityId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
}
