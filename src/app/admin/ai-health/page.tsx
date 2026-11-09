import { Denied } from "@/components/admin/denied";
import { Badge, Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { DEFAULT_WEIGHTS } from "@/server/domain/matching";
import { aiStatus } from "@/server/ai";

export const metadata = { title: "AI Health" };

export default async function AiHealthPage() {
  if (!(await adminGate("analytics.view"))) return <Denied />;
  const ai = aiStatus();
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
        <h2 className="font-semibold text-navy">Resume reading and career suggestions <Badge tone={ai.misconfigured ? "danger" : "success"}>{ai.provider === "anthropic" ? "Claude (AI provider)" : "Built-in rules"}</Badge></h2>
        <p className="mt-2 text-sm text-muted">Resume suggestions use {ai.provider === "anthropic" ? "Claude, with contact details removed before sending" : "Avsar&apos;s built-in reader (no data leaves Avsar)"}. Every suggested item must quote the resume line it came from or it is discarded; students confirm each item before anything is saved. If the AI provider fails, Avsar falls back to the built-in reader; browsing, applying and tracking never depend on it.</p>
        {ai.misconfigured && <p className="mt-2 text-sm text-danger">AVSAR_AI_PROVIDER=anthropic is set but ANTHROPIC_API_KEY is missing, so the built-in reader is being used.</p>}
        <p className="mt-2 text-xs text-muted">To enable Claude: set AVSAR_AI_PROVIDER=anthropic and ANTHROPIC_API_KEY in the server&apos;s secret store (optionally AVSAR_AI_MODEL; default claude-opus-5-5). AI never makes hiring or rejection decisions in Avsar.</p>
      </Card>
    </div>
  );
}
