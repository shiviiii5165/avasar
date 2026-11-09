import Link from "next/link";

import { OrgNav } from "@/components/employer/org-nav";
import { Badge, buttonClass, StateMessage } from "@/components/ui";
import { APPLICATION_STATUS_LABEL } from "@/server/domain/workflows";
import { applicantFilter, listApplicants, listOrgOpportunities } from "@/server/services/employer";

import { studioPage } from "../context";

export const metadata = { title: "Applicants" };

export default async function Applicants({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { orgId } = await params;
  const { ctx, session, db } = await studioPage(orgId, "/applicants");
  const filter = applicantFilter.parse(await searchParams);
  const [rows, listings] = await Promise.all([listApplicants(db, session.identity.id, orgId, filter), listOrgOpportunities(db, session.identity.id, orgId)]);
  return (
    <div>
      <OrgNav ctx={ctx} active="applicants" />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <label className="min-w-0 flex-1 text-sm"><span className="mb-1 block font-semibold text-navy">Search</span><input name="q" defaultValue={filter.q ?? ""} placeholder="Name or headline" className="w-full rounded-md border border-line bg-surface px-3 py-2" /></label>
        <label className="text-sm"><span className="mb-1 block font-semibold text-navy">Listing</span>
          <select name="opportunityId" defaultValue={filter.opportunityId ?? ""} className="rounded-md border border-line bg-surface px-3 py-2"><option value="">All listings</option>{listings.map(({ o }) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></label>
        <label className="text-sm"><span className="mb-1 block font-semibold text-navy">Status</span>
          <select name="status" defaultValue={filter.status ?? ""} className="rounded-md border border-line bg-surface px-3 py-2"><option value="">Any status</option>{Object.entries(APPLICATION_STATUS_LABEL).filter(([k]) => k !== "draft").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <button className={buttonClass("primary", "md")}>Filter</button>
      </form>
      {rows.length === 0 ? (
        <StateMessage kind="empty" title="No applicants match" body="Applications to your live listings appear here." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map(({ a, opportunity }) => {
            const snap = a.profileSnapshot as { fullName?: string | null; headline?: string | null; city?: string | null };
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <Link href={`/studio/${orgId}/applicants/${a.id}`} className="font-semibold text-navy hover:underline">{snap.fullName ?? "Applicant"}</Link>
                  <p className="text-sm text-muted">{[snap.headline, snap.city].filter(Boolean).join(" · ")}{snap.headline || snap.city ? " · " : ""}{opportunity.title}</p>
                </div>
                <span className="flex items-center gap-2 text-sm"><span className="text-muted">{a.submittedAt.toLocaleDateString("en-IN")}</span><Badge tone={a.status === "rejected" ? "danger" : a.status === "selected" || a.status === "offered" ? "success" : "purple"}>{APPLICATION_STATUS_LABEL[a.status]}</Badge></span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
