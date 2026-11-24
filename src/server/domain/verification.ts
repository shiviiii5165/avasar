/**
 * Verification rules for opportunities, employers and sources. Pure.
 *
 * A listing seen on a job portal is NOT a verified employer or vacancy. "verified" and "employer_confirmed"
 * are reachable only through human-reviewed or employer-originated evidence; the system itself can only record
 * that an approved source lists something (source_confirmed) and that a listing expired.
 */
import type { OpportunityVerificationState, SourcePermission } from "../db/schema";

export type EvidenceKind = "official_domain" | "employer_account" | "authorized_source" | "employer_confirmation" | "manual_review" | "system_expiry" | "source_listing";
export type Actor = { kind: "person"; identityId: string } | { kind: "system" };

const OPP_TRANSITIONS: Record<OpportunityVerificationState, OpportunityVerificationState[]> = {
  unverified: ["source_confirmed", "employer_confirmed", "verified", "rejected", "expired"],
  source_confirmed: ["employer_confirmed", "verified", "rejected", "expired", "unverified"],
  employer_confirmed: ["verified", "rejected", "expired", "unverified"],
  verified: ["rejected", "expired", "unverified"],
  expired: ["unverified", "source_confirmed"],
  rejected: ["unverified"],
};

/** Which evidence can justify which state. */
const OPP_EVIDENCE: Partial<Record<OpportunityVerificationState, EvidenceKind[]>> = {
  source_confirmed: ["authorized_source", "source_listing", "manual_review"],
  employer_confirmed: ["employer_account", "employer_confirmation", "official_domain"],
  verified: ["official_domain", "employer_confirmation", "employer_account", "manual_review"],
  expired: ["system_expiry", "manual_review"],
  rejected: ["manual_review"],
  unverified: ["manual_review"],
};

/** Returns a reason the transition is not allowed, or null when it is. */
export function opportunityTransitionProblem(from: OpportunityVerificationState, to: OpportunityVerificationState, evidence: EvidenceKind, actor: Actor, evidenceText: string | null): string | null {
  if (from === to) return "Already in that state";
  if (!OPP_TRANSITIONS[from].includes(to)) return `Cannot move from ${from} to ${to}`;
  if (!OPP_EVIDENCE[to]?.includes(evidence)) return `${evidence} is not evidence for ${to}`;
  // The system may only confirm a source listing or record expiry; everything else needs a person.
  if (actor.kind === "system" && !(to === "source_confirmed" && evidence === "authorized_source") && !(to === "expired" && evidence === "system_expiry")) return "This change needs a reviewer";
  if (actor.kind === "person" && (to === "verified" || to === "employer_confirmed" || to === "rejected") && (evidenceText ?? "").trim().length < 10) return "Describe the evidence (at least 10 characters)";
  return null;
}

/**
 * The legacy badge column (`opportunities.verification`) derived from the state. The UI shows a badge only from
 * this value, so a badge can never exist without the matching state.
 */
export function badgeLevel(state: OpportunityVerificationState, orgVerified: boolean, sourceAuthority: string | null): "unverified" | "source_verified" | "org_verified" {
  if ((state === "verified" || state === "employer_confirmed") && orgVerified) return "org_verified";
  if (state === "verified" || state === "employer_confirmed") return "source_verified";
  if (state === "source_confirmed" && (sourceAuthority === "official" || sourceAuthority === "employer")) return "source_verified";
  return "unverified";
}

export const SOURCE_PERMISSIONS: SourcePermission[] = ["unreviewed", "approved_collection", "approved_display", "disabled"];

export function sourcePermissionProblem(to: SourcePermission, evidence: string | null, accessMethod: string | null): string | null {
  if ((to === "approved_collection" || to === "approved_display") && (evidence ?? "").trim().length < 20) return "Record the permission (agreement, published terms or written consent), at least 20 characters";
  if (to === "approved_collection" && accessMethod === "link_only") return "This source has no permitted collection method; it can only be approved for display/linking";
  return null;
}

export const VERIFICATION_STATE_LABEL: Record<OpportunityVerificationState, string> = {
  unverified: "Unverified",
  source_confirmed: "Listed by an approved source",
  employer_confirmed: "Confirmed by the employer",
  verified: "Verified",
  expired: "Expired",
  rejected: "Rejected",
};
