import { addEmployerCareersSourceAction, addJobBoardSourceAction, addSourceAction, publishReadyFromSourceAction, runSourceNowAction, sourcePermissionAction, toggleSourceAction } from "@/app/actions/admin";
import { Denied } from "@/components/admin/denied";
import { ActionForm, Input, Select, Textarea } from "@/components/forms/action-form";
import { Badge, buttonClass, Card, PageHeader } from "@/components/ui";
import { adminGate } from "@/server/auth/admin-gate";
import { getDb } from "@/server/db/client";
import { ensureSourceRegistry, listSourcesForAdmin, type CoverageMode, type SourceHealth } from "@/server/services/ingestion";

export const metadata = { title: "Source Manager" };
/** "Run now" executes a bounded ingestion pass inside this route's server action. */
export const maxDuration = 60;

const HEALTH: Record<SourceHealth, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "purple" }> = {
  healthy: { label: "Healthy", tone: "success" },
  degraded: { label: "Recent failure", tone: "warning" },
  failing: { label: "Failing", tone: "danger" },
  never_run: { label: "Not run yet", tone: "neutral" },
  not_configured: { label: "Not configured", tone: "warning" },
  awaiting_permission: { label: "Awaiting permission review", tone: "neutral" },
  display_only: { label: "Display/linking only", tone: "purple" },
  disabled: { label: "Disabled", tone: "neutral" },
};
const MODE: Record<CoverageMode, { label: string; tone: "success" | "purple" | "neutral" }> = {
  automated: { label: "Automated collection", tone: "success" },
  links_only: { label: "Links only (students get official search links)", tone: "purple" },
  import_only: { label: "Import only", tone: "neutral" },
};
const PERMISSION_LABEL: Record<string, string> = { unreviewed: "Unreviewed", approved_collection: "Approved for collection", approved_display: "Approved for display/linking only", disabled: "Disabled" };
const when = (d: Date | null | undefined) => (d ? d.toLocaleString("en-IN") : "—");

export default async function SourcesPage() {
  if (!(await adminGate("source.manage"))) return <Denied />;
  const db = await getDb();
  await ensureSourceRegistry(db); // built-in sources appear unreviewed and switched off; never auto-approved
  const sources = await listSourcesForAdmin(db);
  return (
    <div className="space-y-6">
      <PageHeader title="Source Manager" description="Where listings come from and how each may be used. A source collects only when a person has recorded permission, it is switched on and fully configured. Avsar never bypasses logins, CAPTCHAs, rate limits or a site's terms." />
      <div className="space-y-4">
        {sources.map((s) => (
          <Card key={s.id}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-navy">{s.name}</h2>
              <Badge tone={HEALTH[s.health].tone}>{HEALTH[s.health].label}</Badge>
              <Badge>{PERMISSION_LABEL[s.permissionStatus] ?? s.permissionStatus}</Badge>
              <Badge>{s.authority.replace("_", "-")}</Badge>
              {s.adapter && <Badge tone="purple">{s.adapter.accessMethod.replace(/_/g, " ")}</Badge>}
              <Badge tone={MODE[s.coverage.mode].tone}>{MODE[s.coverage.mode].label}</Badge>
            </div>
            {s.coverage.action && <p className="mt-2 rounded-md bg-purple-soft px-3 py-2 text-sm text-navy"><span className="font-semibold">Action needed:</span> {s.coverage.action}</p>}
            {s.url && <p className="mt-1 text-xs text-muted">{s.url}</p>}
            <p className="mt-2 text-sm text-ink/80">{s.termsNote}</p>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
              <div><dt className="text-muted">Last run</dt><dd>{when(s.lastRunAt)}{s.lastRun ? ` (${s.lastRun.status})` : ""}</dd></div>
              <div><dt className="text-muted">Next run</dt><dd>{s.permissionStatus === "approved_collection" && s.active ? when(s.nextRunAt) : "Not scheduled"}</dd></div>
              <div><dt className="text-muted">Last success / failure</dt><dd>{when(s.lastSuccessAt)} / {when(s.lastFailureAt)}</dd></div>
              <div><dt className="text-muted">Last 20 runs</dt><dd>{s.totals.collected} discovered · {s.totals.created} imported · {s.totals.rejected} rejected · {s.totals.duplicates} duplicates · {s.totals.failures} failed</dd></div>
              <div className="sm:col-span-4"><dt className="text-muted">Listings from this source</dt><dd>{Object.entries(s.listings).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(" · ") || "none yet"}</dd></div>
            </dl>
            {s.lastError && <p className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">Last error: {s.lastError}</p>}
            {s.adapter && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer font-semibold text-navy">Adapter details</summary>
                <p className="mt-2">Types: {s.adapter.supportedTypes.join(", ")} · every {s.adapter.frequencyMinutes ? `${Math.round(s.adapter.frequencyMinutes / 60)} h` : "— (no collection)"} · at most {s.adapter.rateLimit.requestsPerMinute} requests/min, {s.adapter.rateLimit.maxRequestsPerRun} per run</p>
                <p className="mt-1">{s.adapter.mapping}</p>
                {s.adapter.config.length > 0 && (
                  <ul className="mt-1 list-disc pl-5">{s.adapter.config.map((c) => <li key={c.env}><code>{c.env}</code> {c.set ? "(set)" : "(not set)"}{c.secret ? " · secret" : ""}: {c.description}</li>)}</ul>
                )}
                {s.missingConfig.length > 0 && <p className="mt-1 text-warning">Missing: {s.missingConfig.join("; ")}</p>}
              </details>
            )}
            {s.permissionEvidence && <p className="mt-2 text-xs text-muted">Permission evidence: {s.permissionEvidence} (recorded {when(s.permissionReviewedAt)})</p>}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <ActionForm action={sourcePermissionAction.bind(null, s.id)} submitLabel="Record permission" className="rounded-lg border border-line p-3">
                <Select name="to" label="Permission status" defaultValue={s.permissionStatus}>
                  <option value="unreviewed">Unreviewed</option>
                  <option value="approved_collection">Approved for collection</option>
                  <option value="approved_display">Approved for display/linking only</option>
                  <option value="disabled">Disabled</option>
                </Select>
                <Textarea name="evidence" label="Evidence of permission" hint="Agreement reference, published terms URL and date checked, or the employer's written consent. Required to approve." />
              </ActionForm>
              <div className="flex flex-wrap items-start gap-2">
                <form action={toggleSourceAction.bind(null, s.id, !s.active)}>
                  <button className={buttonClass("ghost", "sm")}>{s.active ? "Switch off" : "Switch on"}</button>
                </form>
                {s.permissionStatus === "approved_collection" && s.active && s.missingConfig.length === 0 && s.coverage.mode === "automated" && (
                  <form action={runSourceNowAction.bind(null, s.id)}>
                    <button className={buttonClass("secondary", "sm")}>Run now</button>
                  </form>
                )}
                {(s.listings.in_review ?? 0) > 0 && (
                  <form action={publishReadyFromSourceAction.bind(null, s.id)}>
                    <button className={buttonClass("primary", "sm")}>Approve & publish {s.listings.in_review} in review</button>
                    <p className="mt-1 max-w-xs text-xs text-muted">Only listings that pass every publish check are published; flagged or incomplete ones stay in review.</p>
                  </form>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="mb-4 font-semibold text-navy">Add an employer job board</h2>
          <ActionForm action={addJobBoardSourceAction} submitLabel="Add job board" resetOnSuccess>
            <Input name="employer" label="Employer" required />
            <Select name="platform" label="Platform" defaultValue="greenhouse"><option value="greenhouse">Greenhouse (boards.greenhouse.io/…)</option><option value="lever">Lever (jobs.lever.co/…)</option><option value="ashby">Ashby (jobs.ashbyhq.com/…)</option></Select>
            <Input name="board" label="Board id" required hint="The last part of the job-board URL, e.g. groww" />
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold text-navy">Add an employer careers site</h2>
          <ActionForm action={addEmployerCareersSourceAction} submitLabel="Add careers source" resetOnSuccess>
            <Input name="name" label="Employer" required />
            <Input name="url" label="Careers page URL (https)" type="url" required />
            <Textarea name="termsNote" label="How we may use it" required hint="e.g. Employer agreed by email on …; robots.txt allows /careers." />
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold text-navy">Add a manual source</h2>
          <ActionForm action={addSourceAction} submitLabel="Add source" resetOnSuccess>
            <Input name="name" label="Name" required />
            <Select name="kind" label="Kind" defaultValue="manual"><option value="manual">Manual</option><option value="feed">Feed (file or URL)</option><option value="api">API</option></Select>
            <Input name="url" label="URL" type="url" />
            <Textarea name="termsNote" label="Usage terms and permission" required hint="e.g. Partner agreement dated …, public RSS feed allowed for redistribution, rate limit 1 request/minute." />
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
