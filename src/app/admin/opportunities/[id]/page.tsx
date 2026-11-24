import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { opportunityVerificationAction, transitionAction } from "@/app/actions/admin";
import { Denied } from "@/components/admin/denied";
import { OpportunityForm } from "@/components/admin/opportunity-form";
import { ActionForm, Input, Select, Textarea } from "@/components/forms/action-form";
import { SampleBadge } from "@/components/opportunity/opportunity-card";
import { Badge, Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { auditLogs, opportunitySourceRefs, opportunitySources, opportunityVersions, verificationEvents } from "@/server/db/schema";
import { VERIFICATION_STATE_LABEL } from "@/server/domain/verification";
import { can, type Permission } from "@/server/domain/permissions";
import { nextOpportunityStates, publishProblems, type OpportunityStatus } from "@/server/domain/workflows";
import { getOpportunityById } from "@/server/services/opportunities";

export const metadata = { title: "Opportunity" };

const LABEL: Record<OpportunityStatus, string> = {
  draft: "Back to draft", imported: "Imported", in_review: "Send to review", approved: "Approve", published: "Publish", paused: "Pause",
  closed: "Close", expired: "Expire", rejected: "Reject", suspended: "Suspend",
};
const PERM: Partial<Record<OpportunityStatus, Permission>> = {
  in_review: "opportunity.create", draft: "opportunity.create", approved: "opportunity.review", rejected: "opportunity.review",
  published: "opportunity.publish", paused: "opportunity.publish", closed: "opportunity.publish", suspended: "opportunity.suspend",
};

export default async function AdminOpportunity({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; moved?: string }> }) {
  const s = await adminGate("opportunity.review");
  if (!s) return <Denied />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const o = await getOpportunityById(db, id);
  if (!o) notFound();
  const [versions, history, refs, vEvents] = await Promise.all([
    db.select().from(opportunityVersions).where(eq(opportunityVersions.opportunityId, id)).orderBy(desc(opportunityVersions.version)).limit(20),
    db.select().from(auditLogs).where(eq(auditLogs.targetId, id)).orderBy(desc(auditLogs.at)).limit(30),
    db.select({ ref: opportunitySourceRefs, name: opportunitySources.name }).from(opportunitySourceRefs).innerJoin(opportunitySources, eq(opportunitySourceRefs.sourceId, opportunitySources.id)).where(eq(opportunitySourceRefs.opportunityId, id)),
    db.select().from(verificationEvents).where(eq(verificationEvents.targetId, id)).orderBy(desc(verificationEvents.at)).limit(20),
  ]);
  const problems = publishProblems({ ...o, isImported: Boolean(o.sourceId && o.importedAt) });
  const transitions = nextOpportunityStates(o.status).filter((t) => PERM[t] && can(s.roles, PERM[t]!));
  const { saved, moved } = await searchParams;

  return (
    <div className="space-y-6">
      {saved && <p role="status" className="rounded-md bg-success-soft px-4 py-2 text-sm text-success">Saved as version {o.version}.</p>}
      {moved && moved === o.status && <p role="status" className="rounded-md bg-success-soft px-4 py-2 text-sm text-success">Moved to {o.status.replace("_", " ")}. Recorded in the audit log.</p>}
      <PageHeader
        title={o.title}
        description={`${o.organizationName} · version ${o.version}${o.sourceProvider ? ` · source: ${o.sourceProvider}` : ""}`}
        actions={<>{o.isSample && <SampleBadge />}<Badge tone={o.status === "published" ? "success" : "warning"}>{o.status.replace("_", " ")}</Badge>{o.status === "published" && <Link href={`/opportunities/${o.slug}`} className="text-sm font-semibold text-purple hover:underline">View live</Link>}</>}
      />

      <Card>
        <h2 className="font-semibold text-navy">Workflow</h2>
        {problems.length > 0 && (
          <div role="alert" className="mt-3 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
            <p className="font-semibold">Not ready to approve or publish:</p>
            <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {transitions.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {transitions.map((t) => (
              <ActionForm key={t} action={transitionAction.bind(null, o.id, t)} submitLabel={LABEL[t]} className="rounded-lg border border-line p-3">
                <Input name="reason" label="Note for the audit log (optional)" maxLength={300} />
              </ActionForm>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">No further actions available to your role from this status.</p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-navy">Verification and provenance</h2>
        <p className="mt-1 text-sm">State: <Badge tone={o.verificationState === "verified" ? "success" : "neutral"}>{VERIFICATION_STATE_LABEL[o.verificationState]}</Badge> <span className="text-xs text-muted">A badge is shown to students only from this state.</span></p>
        {o.contentFlags.length > 0 && <p role="alert" className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Source text flagged: {o.contentFlags.join(", ")}. Treat it as untrusted; edit it out before publishing.</p>}
        <p className="mt-2 text-xs text-muted">First collected {o.firstCollectedAt?.toLocaleString("en-IN") ?? "—"} · last checked {o.lastCheckedAt?.toLocaleString("en-IN") ?? "—"} · source updated {o.sourceUpdatedAt?.toLocaleString("en-IN") ?? "unknown"}{o.staleSince ? ` · no source has listed it since ${o.staleSince.toLocaleString("en-IN")}` : ""}</p>
        {refs.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">{refs.map((r) => <li key={r.ref.id}>{r.name}: record {r.ref.sourceRecordId} ({r.ref.matchedBy}){r.ref.missingSince ? ` · missing since ${r.ref.missingSince.toLocaleString("en-IN")}` : ""}</li>)}</ul>
        )}
        {can(s.roles, "opportunity.publish") && (
          <ActionForm action={opportunityVerificationAction.bind(null, o.id)} submitLabel="Change verification" className="mt-4 rounded-lg border border-line p-3">
            <Select name="to" label="New state" defaultValue={o.verificationState}>
              {Object.entries(VERIFICATION_STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select name="evidenceKind" label="Evidence" defaultValue="manual_review">
              <option value="manual_review">Manual review</option>
              <option value="employer_confirmation">Direct employer confirmation</option>
              <option value="employer_account">Verified employer account</option>
              <option value="official_domain">Official employer domain</option>
              <option value="authorized_source">Authorized official source</option>
              <option value="source_listing">Listed at the source</option>
            </Select>
            <Textarea name="evidence" label="Describe the evidence" hint="Who confirmed what, and how. Required for verified, employer-confirmed and rejected." />
            <Input name="reason" label="Reason (optional)" maxLength={300} />
          </ActionForm>
        )}
        {vEvents.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted">{vEvents.map((v) => <li key={v.id}>{v.at.toLocaleString("en-IN")}: {v.fromState ?? "—"} → {v.toState} ({v.evidenceKind}{v.reviewerIdentityId ? ", reviewer" : ", system"}){v.evidence ? `: ${v.evidence}` : ""}</li>)}</ul>
        )}
      </Card>

      {can(s.roles, "opportunity.create") && (
        <Card>
          <h2 className="mb-4 font-semibold text-navy">Edit</h2>
          <OpportunityForm o={o} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-navy">Versions</h2>
          <ul className="mt-3 space-y-1 text-sm">{versions.map((v) => <li key={v.id} className="flex justify-between"><span>v{v.version}</span><span className="text-muted">{v.createdAt.toLocaleString("en-IN")}</span></li>)}</ul>
        </Card>
        <Card>
          <h2 className="font-semibold text-navy">Audit trail</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {history.map((h) => <li key={h.id}><span className="font-medium text-navy">{h.action}</span> <span className="text-muted">· {h.at.toLocaleString("en-IN")}{(h.metadata as { reason?: string }).reason ? ` · "${(h.metadata as { reason?: string }).reason}"` : ""}</span></li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
