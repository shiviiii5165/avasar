import Link from "next/link";

import { OrgNav } from "@/components/employer/org-nav";
import { buttonClass, Card, StateMessage } from "@/components/ui";
import { METRIC_DEFINITIONS, orgAnalytics } from "@/server/services/employer";

import { studioPage } from "./context";

export const metadata = { title: "Overview" };

const STAGES = [["views", "Views"], ["saves", "Saves"], ["applications", "Applications"], ["reviewed", "Reviewed"], ["shortlisted", "Shortlisted"], ["interviewed", "Interviewed"], ["offered", "Offered"]] as const;

export default async function OrgOverview({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ joined?: string }> }) {
  const { orgId } = await params;
  const { ctx, session, db } = await studioPage(orgId);
  const { joined } = await searchParams;
  const stats = ctx.can("analytics.view") ? await orgAnalytics(db, session.identity.id, orgId) : null;

  return (
    <div>
      <OrgNav ctx={ctx} active="overview" />
      {joined && <p role="status" className="mb-4 rounded-md bg-success-soft px-4 py-2 text-sm text-success">You&apos;ve joined {ctx.org.name}.</p>}
      {!stats || stats.listings.length === 0 ? (
        <StateMessage kind="empty" title="No listings yet" body="Create a listing; Avsar reviews it before it goes live." action={ctx.can("opportunity.draft") ? <Link href={`/studio/${orgId}/listings/new`} className={buttonClass("primary")}>Create a listing</Link> : undefined} />
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="funnel">
            <h2 id="funnel" className="mb-3 text-lg font-semibold text-navy">Hiring funnel (all listings)</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {STAGES.map(([k, l]) => (
                <div key={k} className="rounded-xl border border-line bg-surface p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted" title={METRIC_DEFINITIONS[k]}>{l}</dt>
                  <dd className="mt-1 text-2xl font-semibold text-navy">{stats.totals[k]}</dd>
                </div>
              ))}
            </dl>
          </section>
          <Card>
            <h2 className="text-lg font-semibold text-navy">By listing</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Listing performance</caption>
                <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">Listing</th><th className="pr-3">Status</th>{STAGES.map(([k, l]) => <th key={k} className="pr-3 text-right">{l}</th>)}<th className="text-right">Conversion</th></tr></thead>
                <tbody>
                  {stats.listings.map((l) => (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3"><Link href={`/studio/${orgId}/listings/${l.id}`} className="font-medium text-navy hover:underline">{l.title}</Link></td>
                      <td className="pr-3 text-muted">{l.status.replace("_", " ")}</td>
                      {STAGES.map(([k]) => <td key={k} className="pr-3 text-right tabular-nums">{l[k]}</td>)}
                      <td className="text-right tabular-nums">{l.views >= 10 ? `${Math.round((l.applications / l.views) * 100)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <details className="rounded-xl border border-line bg-surface p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-navy">How these numbers are defined</summary>
            <dl className="mt-3 space-y-2">{Object.entries(METRIC_DEFINITIONS).map(([k, d]) => <div key={k}><dt className="font-medium capitalize text-navy">{k}</dt><dd className="text-muted">{d}</dd></div>)}</dl>
          </details>
        </div>
      )}
    </div>
  );
}
