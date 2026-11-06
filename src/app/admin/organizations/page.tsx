import { Denied, Table } from "@/components/admin/denied";
import { Badge, PageHeader, StateMessage } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { features } from "@/server/config";
import { getDb } from "@/server/db/client";
import { listOrganizations } from "@/server/services/admin";

export const metadata = { title: "Organizations" };

export default async function OrganizationsPage() {
  if (!(await adminGate("organization.verify"))) return <Denied />;
  const rows = await listOrganizations(await getDb());
  return (
    <div className="space-y-4">
      <PageHeader title="Organizations" description="Organization accounts for the Employer Studio release." />
      <p className="rounded-md bg-surface px-4 py-3 text-sm text-muted">Employer self-service is <strong>{features.employerSelfPublishing() ? "enabled" : "not yet enabled"}</strong>. Until it opens, listings name organizations as text and are published by Avsar staff.</p>
      {rows.length === 0 ? (
        <StateMessage kind="empty" title="No organization accounts yet" body="Organizations will appear here when Employer Studio onboarding opens." />
      ) : (
        <Table head={["Organization", "Website", "Verification", "Created"]} caption="Organizations">
          {rows.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-3 font-medium text-navy">{o.name}</td>
              <td className="px-4 py-3 text-muted">{o.website ?? "—"}</td>
              <td className="px-4 py-3"><Badge tone={o.verificationStatus === "verified" ? "success" : o.verificationStatus === "rejected" || o.verificationStatus === "suspended" ? "danger" : "neutral"}>{o.verificationStatus.replace("_", " ")}</Badge></td>
              <td className="px-4 py-3 text-muted">{o.createdAt.toLocaleDateString("en-IN")}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
