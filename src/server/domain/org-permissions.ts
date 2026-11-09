/**
 * Employer Studio authorization. Checked server-side on every employer action; hiding UI is never the
 * control. Membership is per organization, so every check is (person, organization, permission).
 *
 * Publishing stays with Avsar: no organization role can approve or publish. Employers draft and submit
 * for review; verified organizations can pause, resume or close listings Avsar already approved.
 */
export type OrgRole = "owner" | "recruiter" | "hiring_manager" | "viewer";
export type OrgVerification = "unverified" | "pending" | "under_review" | "verified" | "rejected" | "suspended" | "expired";

export type OrgPermission =
  | "org.edit" | "org.request_verification" | "member.manage"
  | "opportunity.view" | "opportunity.draft" | "opportunity.submit" | "opportunity.pause_close"
  | "applicant.view" | "applicant.update_status" | "applicant.document"
  | "note.read" | "note.write" | "interview.manage" | "assessment.manage" | "message.send"
  | "analytics.view";

const GRANTS: Record<OrgRole, OrgPermission[]> = {
  owner: [
    "org.edit", "org.request_verification", "member.manage", "opportunity.view", "opportunity.draft", "opportunity.submit", "opportunity.pause_close",
    "applicant.view", "applicant.update_status", "applicant.document", "note.read", "note.write", "interview.manage", "assessment.manage", "message.send", "analytics.view",
  ],
  recruiter: [
    "opportunity.view", "opportunity.draft", "opportunity.submit", "opportunity.pause_close",
    "applicant.view", "applicant.update_status", "applicant.document", "note.read", "note.write", "interview.manage", "assessment.manage", "message.send", "analytics.view",
  ],
  hiring_manager: ["opportunity.view", "applicant.view", "applicant.update_status", "applicant.document", "note.read", "note.write", "interview.manage", "assessment.manage", "analytics.view"],
  // Read-only: listings, applicant pipeline and metrics. No documents, no internal notes.
  viewer: ["opportunity.view", "applicant.view", "analytics.view"],
};

/** Actions that also require a verified organization (submitting work to candidates or the public). */
const NEEDS_VERIFIED: OrgPermission[] = ["opportunity.submit", "opportunity.pause_close", "applicant.update_status", "message.send", "interview.manage", "assessment.manage"];

/** Organizations that are suspended or rejected keep read access to their data but can't act. */
const BLOCKED: OrgVerification[] = ["suspended"];

export function orgCan(role: OrgRole | null | undefined, permission: OrgPermission, verification: OrgVerification): boolean {
  if (!role || !GRANTS[role].includes(permission)) return false;
  if (BLOCKED.includes(verification) && permission !== "opportunity.view" && permission !== "applicant.view" && permission !== "analytics.view") return false;
  if (NEEDS_VERIFIED.includes(permission) && verification !== "verified") return false;
  return true;
}

/** Why an action is unavailable, for the UI. Null when allowed. */
export function orgDenialReason(role: OrgRole | null | undefined, permission: OrgPermission, verification: OrgVerification): string | null {
  if (orgCan(role, permission, verification)) return null;
  if (!role || !GRANTS[role].includes(permission)) return "Your role in this organization doesn't include this.";
  if (verification === "suspended") return "This organization is suspended. Contact Avsar support.";
  return "Available once Avsar has verified your organization.";
}

export const ORG_ROLE_LABEL: Record<OrgRole, string> = { owner: "Owner", recruiter: "Recruiter", hiring_manager: "Hiring manager", viewer: "Viewer" };

/** Status changes an employer may make to its own listings (never approve/publish a draft). */
export function employerListingTransition(from: string, to: string): boolean {
  return (
    (from === "draft" && to === "in_review") ||
    (from === "rejected" && to === "draft") ||
    (from === "in_review" && to === "draft") || // withdraw from review to edit
    (from === "published" && (to === "paused" || to === "closed")) ||
    (from === "paused" && (to === "published" || to === "closed")) // resume an already-approved listing
  );
}
