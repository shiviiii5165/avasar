import "server-only";

import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { audit } from "../audit";
import type { Db } from "../db/client";
import { moderationCases, opportunities, opportunityReports, supportTickets } from "../db/schema";
import { canTransitionOpportunity } from "../domain/workflows";

export const REPORT_REASONS = {
  fake_opportunity: "Fake opportunity",
  fake_organization: "Fake organization",
  suspicious_link: "Suspicious link",
  misleading_compensation: "Misleading compensation",
  payment_demand: "Asks me to pay a fee",
  discriminatory: "Discriminatory listing",
  harassment: "Harassment",
  spam: "Spam",
  impersonation: "Impersonation",
  other: "Something else",
} as const;

/** Severity triage: anything that can cost a candidate money or safety is high or critical. */
export function severityFor(reason: keyof typeof REPORT_REASONS): "low" | "medium" | "high" | "critical" {
  if (reason === "payment_demand" || reason === "impersonation") return "critical";
  if (reason === "fake_opportunity" || reason === "fake_organization" || reason === "suspicious_link" || reason === "harassment") return "high";
  if (reason === "discriminatory" || reason === "misleading_compensation") return "medium";
  return "low";
}

export const reportSchema = z.object({
  opportunityId: z.string().uuid(),
  reason: z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS, ...(keyof typeof REPORT_REASONS)[]]),
  details: z.string().trim().max(2000).optional(),
});

/** Files a report and opens (or attaches to) a moderation case. Rate-limited per reporter. */
export async function fileReport(db: Db, reporterId: string, input: z.infer<typeof reportSchema>) {
  const recent = await db.select({ id: opportunityReports.id }).from(opportunityReports).where(and(eq(opportunityReports.reporterIdentityId, reporterId), gte(opportunityReports.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  if (recent.length >= 10) throw new Error("RATE_LIMITED");
  const [opp] = await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.id, input.opportunityId));
  if (!opp) throw new Error("NOT_FOUND");
  return db.transaction(async (tx) => {
    const [report] = await tx.insert(opportunityReports).values({ reporterIdentityId: reporterId, targetType: "opportunity", targetId: input.opportunityId, reason: input.reason, details: input.details ?? null }).returning();
    const severity = severityFor(input.reason);
    const [open] = await tx.select().from(moderationCases).where(and(eq(moderationCases.targetType, "opportunity"), eq(moderationCases.targetId, input.opportunityId), eq(moderationCases.status, "open")));
    if (!open) await tx.insert(moderationCases).values({ reportId: report.id, targetType: "opportunity", targetId: input.opportunityId, severity });
    await audit(tx, { actorId: reporterId, actorRole: "candidate", action: "report.file", targetType: "opportunity", targetId: input.opportunityId, metadata: { reason: input.reason, severity } });
    return report;
  });
}

export const MODERATION_ACTIONS = ["none", "request_correction", "hide", "reject", "suspend_opportunity", "escalate"] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/** Resolves a case. Hide/suspend take the listing out of public view through the normal state machine. */
export async function resolveCase(db: Db, caseId: string, action: ModerationAction, note: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(moderationCases).where(eq(moderationCases.id, caseId)).for("update");
    if (!c) throw new Error("NOT_FOUND");
    if (c.status !== "open" && c.status !== "in_review" && c.status !== "escalated") throw new Error("ALREADY_RESOLVED");
    if (c.targetType === "opportunity" && (action === "hide" || action === "suspend_opportunity" || action === "reject")) {
      const [opp] = await tx.select().from(opportunities).where(eq(opportunities.id, c.targetId)).for("update");
      const to = action === "hide" ? "paused" : action === "reject" ? "rejected" : "suspended";
      if (opp && canTransitionOpportunity(opp.status, to)) {
        await tx.update(opportunities).set({ status: to, updatedAt: new Date() }).where(eq(opportunities.id, opp.id));
        await audit(tx, { actorId, actorRole: "admin", action: `opportunity.${to}`, targetType: "opportunity", targetId: opp.id, metadata: { from: opp.status, viaCase: caseId } });
      }
    }
    const status = action === "escalate" ? "escalated" : action === "none" ? "dismissed" : "actioned";
    const [updated] = await tx.update(moderationCases).set({ status, action, resolutionNote: note.slice(0, 2000), assignedTo: actorId, resolvedAt: action === "escalate" ? null : new Date() }).where(eq(moderationCases.id, caseId)).returning();
    await audit(tx, { actorId, actorRole: "admin", action: "moderation.resolve", targetType: "moderation_case", targetId: caseId, metadata: { action } });
    return updated;
  });
}

export async function listCases(db: Db, status?: string) {
  const rows = await db
    .select({ c: moderationCases, report: opportunityReports, opp: { id: opportunities.id, title: opportunities.title, slug: opportunities.slug, status: opportunities.status } })
    .from(moderationCases)
    .leftJoin(opportunityReports, eq(moderationCases.reportId, opportunityReports.id))
    .leftJoin(opportunities, eq(moderationCases.targetId, opportunities.id))
    .where(status ? eq(moderationCases.status, status as "open") : undefined)
    .orderBy(desc(moderationCases.createdAt))
    .limit(100);
  return rows;
}

export const supportSchema = z.object({ email: z.string().trim().email().max(200).optional(), subject: z.string().trim().min(3).max(140), body: z.string().trim().min(10).max(4000) });

export async function openTicket(db: Db, identityId: string | null, input: z.infer<typeof supportSchema>) {
  const [t] = await db.insert(supportTickets).values({ identityId, email: input.email ?? null, subject: input.subject, body: input.body }).returning();
  return t;
}
