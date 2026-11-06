import Link from "next/link";

import { resolveCaseAction } from "@/app/actions/admin";
import { Denied } from "@/components/admin/denied";
import { ActionForm, Select, Textarea } from "@/components/forms/action-form";
import { Badge, buttonClass, Card, PageHeader, StateMessage } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { listCases, REPORT_REASONS } from "@/server/services/trust";

export const metadata = { title: "Moderation" };
const SEVERITY_TONE = { low: "neutral", medium: "warning", high: "danger", critical: "danger" } as const;
const ACTION_LABEL = { none: "No action (dismiss)", request_correction: "Request correction", hide: "Temporarily hide (pause)", reject: "Reject listing", suspend_opportunity: "Suspend listing", escalate: "Escalate" } as const;

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ status?: string; resolved?: string }> }) {
  if (!(await adminGate("report.moderate"))) return <Denied />;
  const { status = "open", resolved } = await searchParams;
  const valid = ["open", "escalated", "actioned", "dismissed"].includes(status) ? status : "open";
  const cases = await listCases(await getDb(), valid);
  return (
    <div className="space-y-4">
      <PageHeader title="Moderation" description="Report → case → severity → review → action → audit. Payment demands and impersonation are triaged as critical." />
      {resolved && resolved in ACTION_LABEL && <p role="status" className="rounded-md bg-success-soft px-4 py-2 text-sm text-success">Case resolved ({ACTION_LABEL[resolved as keyof typeof ACTION_LABEL]}) and recorded in the audit log.</p>}
      <nav aria-label="Case status" className="flex gap-1.5">{["open", "escalated", "actioned", "dismissed"].map((st) => <Link key={st} href={`/admin/moderation?status=${st}`} className={buttonClass(valid === st ? "secondary" : "ghost", "sm")}>{st}</Link>)}</nav>
      {cases.length === 0 ? (
        <StateMessage kind="empty" title={`No ${valid} cases`} />
      ) : (
        <ul className="space-y-3">
          {cases.map(({ c, report, opp }) => (
            <li key={c.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={SEVERITY_TONE[c.severity]}>{c.severity}</Badge>
                  {report && <Badge>{REPORT_REASONS[report.reason]}</Badge>}
                  <span className="text-xs text-muted">opened {c.createdAt.toLocaleString("en-IN")}</span>
                </div>
                <p className="font-semibold text-navy">{opp?.title ?? "Removed listing"} <span className="text-sm font-normal text-muted">({opp?.status})</span> {opp && <Link href={`/admin/opportunities/${opp.id}`} className="text-sm text-purple hover:underline">open listing</Link>}</p>
                {report?.details && <p className="rounded-md bg-surface-muted p-3 text-sm text-ink/80">&ldquo;{report.details}&rdquo;</p>}
                {c.resolutionNote && <p className="text-sm text-muted">Decision: {c.action} · {c.resolutionNote}</p>}
                {(c.status === "open" || c.status === "escalated") && (
                  <ActionForm action={resolveCaseAction.bind(null, c.id)} submitLabel="Record decision" className="grid gap-3 border-t border-line pt-3 md:grid-cols-2">
                    <Select name="action" label="Action" defaultValue="">{[<option key="" value="" disabled>Choose</option>, ...Object.entries(ACTION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)]}</Select>
                    <Textarea name="note" label="Reason (recorded in audit log)" required rows={2} />
                  </ActionForm>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
