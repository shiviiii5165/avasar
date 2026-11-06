import { verificationDecisionAction } from "@/app/actions/admin";
import { Denied } from "@/components/admin/denied";
import { ActionForm, Select, Textarea } from "@/components/forms/action-form";
import { Badge, Card, PageHeader, StateMessage } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { listVerificationRequests } from "@/server/services/admin";

export const metadata = { title: "Verification" };

export default async function VerificationPage() {
  if (!(await adminGate("organization.verify"))) return <Denied />;
  const rows = await listVerificationRequests(await getDb());
  return (
    <div className="space-y-4">
      <PageHeader title="Verification" description="Review organization verification requests against documented evidence: official domain, website, registration, authorized representative." />
      <p className="text-xs text-muted">A Verified badge records that this process was completed. It isn&apos;t a guarantee of future conduct or employment.</p>
      {rows.length === 0 ? (
        <StateMessage kind="empty" title="No verification requests" body="Requests arrive when organizations apply through Employer Studio." />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ r, org }) => (
            <li key={r.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-navy">{org.name} <span className="text-sm font-normal text-muted">{org.website ?? ""}{org.domain ? ` · ${org.domain}` : ""}</span></p>
                  <Badge>{r.status.replace("_", " ")}</Badge>
                </div>
                {r.decisionNote && <p className="text-sm text-muted">Note: {r.decisionNote}</p>}
                {["pending", "under_review"].includes(r.status) && (
                  <ActionForm action={verificationDecisionAction.bind(null, r.id)} submitLabel="Record decision" className="grid gap-3 md:grid-cols-2">
                    <Select name="decision" label="Decision" defaultValue="under_review"><option value="under_review">Under review</option><option value="verified">Verified</option><option value="rejected">Rejected</option></Select>
                    <Textarea name="note" label="Evidence relied on (recorded)" required rows={2} />
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
