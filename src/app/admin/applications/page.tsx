import { applicationStatusAction } from "@/app/actions/admin";
import { Denied } from "@/components/admin/denied";
import { ActionForm, Input, Select } from "@/components/forms/action-form";
import { SampleBadge } from "@/components/opportunity/opportunity-card";
import { STATUS_TONE } from "@/components/opportunity/status";
import { Badge, Card, PageHeader, StateMessage } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { can } from "@/server/domain/permissions";
import { APPLICATION_STATUS_LABEL, canTransitionApplication, type ApplicationStatus } from "@/server/domain/workflows";
import { listApplicationsAdmin } from "@/server/services/admin";

export const metadata = { title: "Applications & Reports" };
const ALL: ApplicationStatus[] = ["viewed", "under_review", "shortlisted", "assessment", "interview", "offered", "selected", "rejected", "closed"];

export default async function AdminApplications() {
  const s = await adminGate("application.view_all");
  if (!s) return <Denied />;
  const rows = await listApplicationsAdmin(await getDb());
  const canUpdate = can(s.roles, "application.update_status");
  return (
    <div className="space-y-4">
      <PageHeader title="Applications & Reports" description="Applications submitted on Avsar. Until Employer Studio opens, status updates here are made by Avsar staff on behalf of organizations; every change is recorded and the candidate is notified." />
      {rows.length === 0 ? (
        <StateMessage kind="empty" title="No applications yet" />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ a, o, p }) => {
            const options = ALL.filter((st) => canTransitionApplication(a.status, st, "admin"));
            return (
              <li key={a.id}>
                <Card className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">{p.fullName ?? "Candidate"} → {o.title} {o.isSample && <SampleBadge />}</p>
                    <p className="text-sm text-muted">{o.organizationName} · submitted {a.submittedAt.toLocaleString("en-IN")} · listing v{a.opportunityVersion}</p>
                    <Badge tone={STATUS_TONE[a.status]} className="mt-2">{APPLICATION_STATUS_LABEL[a.status]}</Badge>
                  </div>
                  {canUpdate && options.length > 0 && (
                    <ActionForm action={applicationStatusAction.bind(null, a.id)} submitLabel="Update status" className="w-full max-w-sm">
                      <Select name="status" label="New status" defaultValue={options[0]}>{options.map((st) => <option key={st} value={st}>{APPLICATION_STATUS_LABEL[st]}</option>)}</Select>
                      <Input name="reason" label="Reason (recorded)" maxLength={500} />
                    </ActionForm>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
