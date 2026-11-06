import Link from "next/link";

import { Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { can } from "@/server/domain/permissions";
import { METRIC_DEFINITIONS, platformMetrics, reviewQueue } from "@/server/services/admin";

export const metadata = { title: "Overview" };

export default async function AdminOverview() {
  const s = (await adminGate(null))!;
  const db = await getDb();
  const [m, queue] = await Promise.all([platformMetrics(db), reviewQueue(db)]);
  const tiles: [keyof typeof METRIC_DEFINITIONS, string, string][] = [
    ["publishedOpportunities", "Published opportunities", String(m.publishedOpportunities)],
    ["applications", "Applications", String(m.applications)],
    ["successfulOutcomes", "Successful outcomes", String(m.successfulOutcomes)],
    ["activeCandidates", "Active candidates (30d)", String(m.activeCandidates)],
    ["openReports", "Open reports", String(m.openReports)],
    ["moderationTurnaround", "Moderation turnaround", m.moderationTurnaround === null ? "No data yet" : `${m.moderationTurnaround} h`],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Live platform figures. Sample listings and their applications are excluded from every number." />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map(([key, label, value]) => (
          <li key={key}><Card><p className="text-sm text-muted">{label}</p><p className="mt-1 text-3xl font-bold text-navy">{value}</p><p className="mt-2 text-xs text-muted">{METRIC_DEFINITIONS[key]}</p></Card></li>
        ))}
      </ul>
      {m.sampleListings > 0 && <p className="text-xs text-muted">{m.sampleListings} sample listings exist for demonstration and are excluded above.</p>}
      {can(s.roles, "opportunity.review") && (
        <Card>
          <div className="flex items-center justify-between"><h2 className="font-semibold text-navy">Needs attention: {queue.length} listing{queue.length === 1 ? "" : "s"} awaiting review or publishing</h2><Link href="/admin/opportunities?status=in_review" className="text-sm font-semibold text-purple hover:underline">Open queue</Link></div>
          <ul className="mt-3 divide-y divide-line">
            {queue.slice(0, 6).map((o) => <li key={o.id} className="flex justify-between gap-3 py-2 text-sm"><Link href={`/admin/opportunities/${o.id}`} className="font-medium text-navy hover:underline">{o.title}</Link><span className="text-muted">{o.status.replace("_", " ")}</span></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
