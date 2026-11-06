/**
 * State machines for opportunities and applications. Every transition is validated here, so the UI,
 * the API and background jobs all obey the same rules.
 */

// ─── Opportunity pipeline ──────────────────────────────────────────────────
// Discovered/imported → normalized → validated → review → approved → published (never auto-published).
export type OpportunityStatus = "draft" | "imported" | "in_review" | "approved" | "published" | "paused" | "closed" | "expired" | "rejected" | "suspended";

const OPP_TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  draft: ["in_review", "rejected"],
  imported: ["in_review", "rejected"],
  in_review: ["approved", "rejected", "draft"],
  approved: ["published", "in_review", "rejected"],
  published: ["paused", "closed", "expired", "suspended"],
  paused: ["published", "closed", "suspended"],
  closed: ["in_review"],
  expired: ["in_review"],
  rejected: ["draft"],
  suspended: ["in_review", "closed"],
};

export function canTransitionOpportunity(from: OpportunityStatus, to: OpportunityStatus): boolean {
  return OPP_TRANSITIONS[from].includes(to);
}

export function nextOpportunityStates(from: OpportunityStatus): OpportunityStatus[] {
  return OPP_TRANSITIONS[from];
}

/** Publishing needs these fields; returns the problems (empty = publishable). */
export function publishProblems(o: {
  title: string;
  description: string;
  organizationName: string;
  deadline: Date | null;
  applicationMethod: "internal" | "external";
  externalUrl: string | null;
  sourceUrl: string | null;
  isImported: boolean;
}, now = new Date()): string[] {
  const problems: string[] = [];
  if (o.title.trim().length < 4) problems.push("Title is too short");
  if (o.description.trim().length < 40) problems.push("Description must be at least 40 characters");
  if (!o.organizationName.trim()) problems.push("Organization name is required");
  if (o.deadline && o.deadline.getTime() <= now.getTime()) problems.push("Deadline is in the past");
  if (o.applicationMethod === "external") {
    if (!o.externalUrl) problems.push("External application URL is required");
    else if (!isSafeHttpsUrl(o.externalUrl)) problems.push("External application URL must be a valid https:// link");
  }
  if (o.isImported && !o.sourceUrl) problems.push("Imported listings must keep their source URL");
  return problems;
}

export function isSafeHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.includes(".") && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Visible to the public only when published, not past deadline. */
export function isPubliclyVisible(o: { status: OpportunityStatus; deadline: Date | null }, now = new Date()): boolean {
  return o.status === "published" && (!o.deadline || o.deadline.getTime() > now.getTime());
}

// ─── Applications ──────────────────────────────────────────────────────────
export type ApplicationStatus = "draft" | "submitted" | "viewed" | "under_review" | "shortlisted" | "assessment" | "interview" | "offered" | "selected" | "rejected" | "withdrawn" | "closed";
export type Actor = "candidate" | "admin" | "employer" | "system";

const TERMINAL: ApplicationStatus[] = ["selected", "rejected", "withdrawn", "closed"];
const REVIEW_FLOW: ApplicationStatus[] = ["submitted", "viewed", "under_review", "shortlisted", "assessment", "interview", "offered", "selected"];

export function canTransitionApplication(from: ApplicationStatus, to: ApplicationStatus, actor: Actor): boolean {
  if (from === to || TERMINAL.includes(from)) return false;
  if (actor === "candidate") return to === "withdrawn" && from !== "draft"; // candidates can only withdraw
  if (actor === "system") return to === "closed"; // e.g. listing closed or expired
  if (to === "withdrawn") return false; // only the candidate withdraws
  if (to === "draft") return false;
  if (to === "rejected" || to === "closed") return from !== "draft";
  // Reviewers move forward through the flow; steps may be skipped (not every hire has an assessment).
  const a = REVIEW_FLOW.indexOf(from);
  const b = REVIEW_FLOW.indexOf(to);
  return a >= 0 && b > a;
}

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  viewed: "Viewed",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  assessment: "Assessment",
  interview: "Interview",
  offered: "Offered",
  selected: "Selected",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

/** Outcomes that count as success in metrics. Applications alone never do. */
export const SUCCESS_OUTCOMES: ApplicationStatus[] = ["selected"];
