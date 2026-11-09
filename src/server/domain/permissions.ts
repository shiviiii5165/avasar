/**
 * Least-privilege authorization for Admin Studio. The backend checks these on every admin action;
 * hiding a button in the UI is never the control.
 */
export type AdminRole = "super_admin" | "platform_admin" | "verification_officer" | "moderator" | "support_agent" | "analytics_admin";

export type Permission =
  | "opportunity.create"
  | "opportunity.review"
  | "opportunity.publish"
  | "opportunity.suspend"
  | "source.manage"
  | "import.review"
  | "organization.verify"
  | "report.moderate"
  | "application.view_all"
  | "application.update_status"
  | "support.handle"
  | "analytics.view"
  | "audit.view"
  | "role.grant"
  | "candidate.view"
  /** Open ANY candidate's private documents (resumes). Separate from the candidate directory on purpose. */
  | "document.view_any";

const GRANTS: Record<AdminRole, Permission[]> = {
  super_admin: [
    "opportunity.create", "opportunity.review", "opportunity.publish", "opportunity.suspend", "source.manage", "import.review",
    "organization.verify", "report.moderate", "application.view_all", "application.update_status", "support.handle",
    "analytics.view", "audit.view", "role.grant", "candidate.view", "document.view_any",
  ],
  platform_admin: [
    "opportunity.create", "opportunity.review", "opportunity.publish", "opportunity.suspend", "source.manage", "import.review",
    "report.moderate", "application.view_all", "application.update_status", "analytics.view", "audit.view", "candidate.view",
  ],
  verification_officer: ["organization.verify", "audit.view"],
  moderator: ["report.moderate", "opportunity.suspend", "opportunity.review"],
  support_agent: ["support.handle", "candidate.view"],
  analytics_admin: ["analytics.view"],
};

export function can(roles: readonly AdminRole[], permission: Permission): boolean {
  return roles.some((r) => GRANTS[r]?.includes(permission));
}

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  platform_admin: "Platform Admin",
  verification_officer: "Verification Officer",
  moderator: "Moderator",
  support_agent: "Support Agent",
  analytics_admin: "Analytics Admin",
};
