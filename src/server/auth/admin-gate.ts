import "server-only";

import { can, type Permission } from "../domain/permissions";
import { requireUser } from "./session";

export const ADMIN_NAV: { href: string; label: string; permission: Permission | null }[] = [
  { href: "/admin", label: "Overview", permission: null },
  { href: "/admin/candidates", label: "Candidates", permission: "candidate.view" },
  { href: "/admin/organizations", label: "Organizations", permission: "organization.verify" },
  { href: "/admin/verification", label: "Verification", permission: "organization.verify" },
  { href: "/admin/opportunities", label: "Opportunities", permission: "opportunity.review" },
  { href: "/admin/sources", label: "Source Manager", permission: "source.manage" },
  { href: "/admin/imports", label: "Import Review", permission: "import.review" },
  { href: "/admin/applications", label: "Applications & Reports", permission: "application.view_all" },
  { href: "/admin/moderation", label: "Moderation", permission: "report.moderate" },
  { href: "/admin/support", label: "Support", permission: "support.handle" },
  { href: "/admin/notifications", label: "Notifications", permission: "source.manage" },
  { href: "/admin/analytics", label: "Analytics", permission: "analytics.view" },
  { href: "/admin/health", label: "System Health", permission: "source.manage" },
  { href: "/admin/ai-health", label: "AI Health", permission: "analytics.view" },
  { href: "/admin/audit", label: "Audit Logs", permission: "audit.view" },
  { href: "/admin/configuration", label: "Configuration", permission: "role.grant" },
];

/** For admin pages: the session if allowed, or null so the page renders "access denied" (never the data). */
export async function adminGate(permission: Permission | null) {
  const s = await requireUser("/admin");
  if (!s.roles.length) return null;
  if (permission && !can(s.roles, permission)) return null;
  return s;
}
