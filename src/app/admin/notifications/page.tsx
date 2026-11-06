import { count, desc, eq } from "drizzle-orm";

import { Denied, Table } from "@/components/admin/denied";
import { Badge, Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { jobs, notifications } from "@/server/db/schema";

export const metadata = { title: "Notifications" };

export default async function AdminNotifications() {
  if (!(await adminGate("source.manage"))) return <Denied />;
  const db = await getDb();
  const [[inApp], emailJobs] = await Promise.all([
    db.select({ n: count() }).from(notifications),
    db.select().from(jobs).where(eq(jobs.type, "email.notification")).orderBy(desc(jobs.createdAt)).limit(50),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Notifications" description="In-app notifications are deduplicated per event; emails go through the durable job queue with retries." />
      <Card><p className="text-sm text-muted">In-app notifications created</p><p className="text-3xl font-bold text-navy">{inApp.n}</p>
        <p className="mt-2 text-xs text-muted">Email provider: {process.env.AVSAR_EMAIL_WEBHOOK_URL ? "configured" : "not configured (emails are logged, not sent)"}.</p></Card>
      <Table head={["Event", "Status", "Attempts", "Last error", "Created"]} caption="Email deliveries">
        {emailJobs.map((j) => (
          <tr key={j.id}>
            <td className="px-4 py-3">{String(j.payload.kind ?? j.type)}</td>
            <td className="px-4 py-3"><Badge tone={j.status === "done" ? "success" : j.status === "dead" ? "danger" : "warning"}>{j.status}</Badge></td>
            <td className="px-4 py-3">{j.attempts}/{j.maxAttempts}</td>
            <td className="px-4 py-3 text-xs text-muted">{j.lastError ?? "—"}</td>
            <td className="px-4 py-3 text-muted">{j.createdAt.toLocaleString("en-IN")}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
