import { Denied, Table } from "@/components/admin/denied";
import { PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { listAudit } from "@/server/services/admin";

export const metadata = { title: "Audit Logs" };

export default async function AuditPage() {
  if (!(await adminGate("audit.view"))) return <Denied />;
  const rows = await listAudit(await getDb());
  return (
    <div className="space-y-4">
      <PageHeader title="Audit Logs" description="Append-only record of sensitive actions (latest 200). Metadata never contains secrets or document contents." />
      <Table head={["When", "Actor", "Role", "Action", "Target", "Details"]} caption="Audit log">
        {rows.map(({ log, actor }) => (
          <tr key={log.id}>
            <td className="whitespace-nowrap px-4 py-3 text-muted">{log.at.toLocaleString("en-IN")}</td>
            <td className="px-4 py-3">{actor?.name ?? "system"}</td>
            <td className="px-4 py-3 text-muted">{log.actorRole}</td>
            <td className="px-4 py-3 font-medium text-navy">{log.action}</td>
            <td className="px-4 py-3 text-xs text-muted">{log.targetType}{log.targetId ? ` · ${log.targetId.slice(0, 8)}` : ""}</td>
            <td className="max-w-xs px-4 py-3 text-xs text-muted">{Object.keys(log.metadata).length ? JSON.stringify(log.metadata) : ""}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
