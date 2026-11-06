import { Denied } from "@/components/admin/denied";
import { Badge, Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { DEFAULT_WEIGHTS } from "@/server/domain/matching";

export const metadata = { title: "AI Health" };

export default async function AiHealthPage() {
  if (!(await adminGate("analytics.view"))) return <Denied />;
  return (
    <div className="space-y-4">
      <PageHeader title="AI Health" description="What intelligence runs in Avsar today, and what it depends on." />
      <Card>
        <h2 className="font-semibold text-navy">Matching and eligibility <Badge tone="success">Running</Badge></h2>
        <p className="mt-2 text-sm text-muted">Deterministic and explainable, computed in-process. No external AI provider is involved, so these can&apos;t fail because one is down.</p>
        <p className="mt-3 text-sm text-navy">Current weights (hypotheses, not validated):</p>
        <ul className="mt-1 grid gap-1 text-sm text-muted sm:grid-cols-3">{Object.entries(DEFAULT_WEIGHTS).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
      </Card>
      <Card>
        <h2 className="font-semibold text-navy">External AI provider <Badge>Not configured</Badge></h2>
        <p className="mt-2 text-sm text-muted">Resume parsing, skill extraction and AI-assisted discovery are planned (Release 7). When added, they will run in background jobs, require candidate confirmation, and never block browsing, profiles or applications if the provider is unavailable.</p>
      </Card>
    </div>
  );
}
