import { desc, eq } from "drizzle-orm";

import { grantRoleAction } from "@/app/actions/admin";
import { Denied, Table } from "@/components/admin/denied";
import { ActionForm, Select } from "@/components/forms/action-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { devAuthEnabled, features, tathastuConfig } from "@/server/config";
import { getDb } from "@/server/db/client";
import { adminRoles, userIdentities } from "@/server/db/schema";
import { ADMIN_ROLE_LABEL } from "@/server/domain/permissions";

export const metadata = { title: "Configuration" };

export default async function ConfigurationPage() {
  if (!(await adminGate("role.grant"))) return <Denied />;
  const db = await getDb();
  const [roles, people] = await Promise.all([
    db.select({ role: adminRoles.role, name: userIdentities.name, provider: userIdentities.provider, grantedAt: adminRoles.grantedAt }).from(adminRoles).innerJoin(userIdentities, eq(adminRoles.identityId, userIdentities.id)).orderBy(desc(adminRoles.grantedAt)),
    db.select({ id: userIdentities.id, name: userIdentities.name, provider: userIdentities.provider }).from(userIdentities).orderBy(desc(userIdentities.createdAt)).limit(200),
  ]);
  const flag = (on: boolean) => <Badge tone={on ? "warning" : "neutral"}>{on ? "On" : "Off"}</Badge>;
  return (
    <div className="space-y-6">
      <PageHeader title="Configuration" description="Feature gates and staff roles. Secret values are never displayed." />
      <Card>
        <h2 className="font-semibold text-navy">Feature gates</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt>Employer self-publishing (Release 6)</dt><dd>{flag(features.employerSelfPublishing())}</dd></div>
          <div className="flex justify-between gap-3"><dt>Development sign-in (never in production)</dt><dd>{flag(devAuthEnabled())}</dd></div>
          <div className="flex justify-between gap-3"><dt>AI Tathastu SSO configured</dt><dd>{flag(Boolean(tathastuConfig().config))}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">Gates are set through environment variables in each deployment and audited through the deployment process, not toggled here.</p>
      </Card>
      <section>
        <h2 className="mb-3 font-semibold text-navy">Staff roles</h2>
        <Table head={["Person", "Role", "Sign-in", "Granted"]} caption="Staff roles">
          {roles.map((r, i) => (
            <tr key={i}><td className="px-4 py-3">{r.name ?? "—"}</td><td className="px-4 py-3">{ADMIN_ROLE_LABEL[r.role]}</td><td className="px-4 py-3 text-muted">{r.provider}</td><td className="px-4 py-3 text-muted">{r.grantedAt.toLocaleDateString("en-IN")}</td></tr>
          ))}
        </Table>
      </section>
      <Card className="max-w-xl">
        <h2 className="mb-4 font-semibold text-navy">Grant a role</h2>
        <ActionForm action={grantRoleAction} submitLabel="Grant role">
          <Select name="identityId" label="Person" required defaultValue="">{[<option key="" value="" disabled>Choose</option>, ...people.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.id.slice(0, 8)} ({p.provider})</option>)]}</Select>
          <Select name="role" label="Role" defaultValue="support_agent">{Object.entries(ADMIN_ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        </ActionForm>
      </Card>
    </div>
  );
}
