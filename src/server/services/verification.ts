import "server-only";

import { eq } from "drizzle-orm";

import { audit } from "../audit";
import type { Db } from "../db/client";
import { opportunities, opportunitySources, organizations, verificationEvents, type OpportunityVerificationState, type SourcePermission } from "../db/schema";
import { badgeLevel, opportunityTransitionProblem, sourcePermissionProblem, type Actor, type EvidenceKind } from "../domain/verification";
import { adapterFor } from "../ingestion/adapters";

export class VerificationError extends Error {}

type Tx = Pick<Db, "select" | "update" | "insert">;

/**
 * Moves a listing's verification state, with evidence, reviewer and reason recorded (verification_events +
 * audit log), and recomputes the badge column from the new state. Throws VerificationError when not allowed.
 */
export async function setOpportunityVerification(db: Db | Tx, opportunityId: string, to: OpportunityVerificationState, input: { actor: Actor; evidenceKind: EvidenceKind; evidence?: string | null; reason?: string | null }) {
  const [row] = await db
    .select({ state: opportunities.verificationState, orgStatus: organizations.verificationStatus, authority: opportunitySources.authority })
    .from(opportunities)
    .leftJoin(organizations, eq(opportunities.orgId, organizations.id))
    .leftJoin(opportunitySources, eq(opportunities.sourceId, opportunitySources.id))
    .where(eq(opportunities.id, opportunityId));
  if (!row) throw new VerificationError("Opportunity not found");
  const problem = opportunityTransitionProblem(row.state, to, input.evidenceKind, input.actor, input.evidence ?? null);
  if (problem) throw new VerificationError(problem);
  const reviewer = input.actor.kind === "person" ? input.actor.identityId : null;
  await db.update(opportunities).set({ verificationState: to, verification: badgeLevel(to, row.orgStatus === "verified", row.authority), lastVerifiedAt: to === "verified" || to === "employer_confirmed" ? new Date() : undefined, updatedAt: new Date() }).where(eq(opportunities.id, opportunityId));
  await db.insert(verificationEvents).values({ targetType: "opportunity", targetId: opportunityId, fromState: row.state, toState: to, evidenceKind: input.evidenceKind, evidence: input.evidence?.slice(0, 2000) ?? null, reason: input.reason?.slice(0, 1000) ?? null, reviewerIdentityId: reviewer });
  await audit(db, { actorId: reviewer, actorRole: reviewer ? "admin" : "system", action: `opportunity.verification.${to}`, targetType: "opportunity", targetId: opportunityId, metadata: { from: row.state, evidenceKind: input.evidenceKind } });
}

/** Records a person's decision on how a source may be used. Never automatic. */
export async function setSourcePermission(db: Db, sourceId: string, to: SourcePermission, input: { reviewerId: string; evidence: string | null; reason?: string | null }) {
  const [src] = await db.select().from(opportunitySources).where(eq(opportunitySources.id, sourceId));
  if (!src) throw new VerificationError("Source not found");
  const adapter = adapterFor(src.adapterKey);
  const problem = sourcePermissionProblem(to, input.evidence, adapter?.accessMethod ?? (src.kind === "manual" ? "link_only" : null));
  if (problem) throw new VerificationError(problem);
  await db.transaction(async (tx) => {
    await tx
      .update(opportunitySources)
      .set({
        permissionStatus: to,
        permissionEvidence: input.evidence?.trim().slice(0, 2000) || null,
        permissionReviewedBy: input.reviewerId,
        permissionReviewedAt: new Date(),
        // Disabling stops collection at once; approval does not switch a source on by itself.
        active: to === "disabled" ? false : src.active,
        nextRunAt: to === "approved_collection" ? new Date() : null,
      })
      .where(eq(opportunitySources.id, sourceId));
    await tx.insert(verificationEvents).values({ targetType: "source", targetId: sourceId, fromState: src.permissionStatus, toState: to, evidenceKind: "manual_review", evidence: input.evidence?.slice(0, 2000) ?? null, reason: input.reason ?? null, reviewerIdentityId: input.reviewerId });
    await audit(tx, { actorId: input.reviewerId, actorRole: "admin", action: `source.permission.${to}`, targetType: "source", targetId: sourceId, metadata: { from: src.permissionStatus } });
  });
}

export async function verificationHistory(db: Db, targetType: "opportunity" | "organization" | "source", targetId: string) {
  return db.select().from(verificationEvents).where(eq(verificationEvents.targetId, targetId)).then((rows) => rows.filter((r) => r.targetType === targetType).sort((a, b) => b.at.getTime() - a.at.getTime()));
}
