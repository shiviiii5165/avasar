import { Denied } from "@/components/admin/denied";
import { Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { METRIC_DEFINITIONS, platformMetrics } from "@/server/services/admin";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  if (!(await adminGate("analytics.view"))) return <Denied />;
  const m = await platformMetrics(await getDb());
  const rows: [keyof typeof METRIC_DEFINITIONS, string | number][] = [
    ["activeCandidates", m.activeCandidates],
    ["publishedOpportunities", m.publishedOpportunities],
    ["applications", m.applications],
    ["successfulOutcomes", m.successfulOutcomes],
    ["verifiedOrganizations", m.verifiedOrganizations],
    ["openReports", m.openReports],
    ["moderationTurnaround", m.moderationTurnaround === null ? "No data yet" : `${m.moderationTurnaround} h`],
  ];
  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" description="Every metric with its exact definition. Sample data is excluded; nothing is estimated." />
      <Card>
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div><dt className="font-medium text-navy">{k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt><p className="text-xs text-muted">{METRIC_DEFINITIONS[k]}</p></div>
              <dd className="text-2xl font-bold text-navy">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <p className="text-xs text-muted">Employer funnel metrics (views → starts → completed → shortlisted → interview → offer) become available with Employer Studio. Retention and liquidity need several weeks of real data before they are meaningful, so they are not shown yet.</p>
    </div>
  );
}
