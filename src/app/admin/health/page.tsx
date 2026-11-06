import { retryJobAction } from "@/app/actions/admin";
import { Denied, Table } from "@/components/admin/denied";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { tathastuConfig } from "@/server/config";
import { getDb } from "@/server/db/client";
import { systemHealth } from "@/server/services/admin";

export const metadata = { title: "System Health" };

export default async function HealthPage() {
  if (!(await adminGate("source.manage"))) return <Denied />;
  const h = await systemHealth(await getDb());
  const sso = tathastuConfig();
  const ok = (b: boolean) => <Badge tone={b ? "success" : "danger"}>{b ? "OK" : "Problem"}</Badge>;
  return (
    <div className="space-y-4">
      <PageHeader title="System Health" description="Live checks. Values are measured on each load." />
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="text-sm text-muted">Database</p><div className="mt-1 flex items-center gap-2">{ok(h.dbOk)}<span className="text-sm text-muted">{h.latencyMs} ms</span></div><p className="mt-2 text-xs text-muted">{process.env.DATABASE_URL ? "PostgreSQL" : "Embedded development database"}</p></Card>
        <Card><p className="text-sm text-muted">Job queue</p><p className="mt-1 text-sm text-navy">{Object.entries(h.jobs).map(([k, v]) => `${k}: ${v}`).join(" · ") || "empty"}</p><p className="mt-2 text-xs text-muted">Oldest waiting: {h.oldestQueued?.toLocaleString("en-IN") ?? "none"}. Run <code>npm run worker</code> to process jobs.</p></Card>
        <Card><p className="text-sm text-muted">AI Tathastu SSO</p><div className="mt-1">{ok(Boolean(sso.config))}</div><p className="mt-2 text-xs text-muted">{sso.config ? "Configured (values hidden)" : `Missing: ${sso.missing.join(", ")}`}</p></Card>
      </div>
      <section>
        <h2 className="mb-3 font-semibold text-navy">Dead-lettered jobs</h2>
        <Table head={["Type", "Attempts", "Last error", "Created", ""]} caption="Dead jobs">
          {h.dead.map((j) => (
            <tr key={j.id}>
              <td className="px-4 py-3">{j.type}</td>
              <td className="px-4 py-3">{j.attempts}</td>
              <td className="px-4 py-3 text-xs text-muted">{j.lastError}</td>
              <td className="px-4 py-3 text-muted">{j.createdAt.toLocaleString("en-IN")}</td>
              <td className="px-4 py-3"><form action={retryJobAction.bind(null, j.id)}><button className={buttonClass("ghost", "sm")}>Retry</button></form></td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
