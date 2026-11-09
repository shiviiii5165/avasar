import Link from "next/link";

import { LISTING_STATUS, OrgNav } from "@/components/employer/org-nav";
import { Badge, buttonClass, StateMessage } from "@/components/ui";
import { listOrgOpportunities } from "@/server/services/employer";

import { studioPage } from "../context";

export const metadata = { title: "Listings" };


export default async function Listings({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { ctx, session, db } = await studioPage(orgId, "/listings");
  const rows = await listOrgOpportunities(db, session.identity.id, orgId);
  return (
    <div>
      <OrgNav ctx={ctx} active="listings" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Avsar reviews and publishes every listing. You can pause or close live listings at any time.</p>
        {ctx.can("opportunity.draft") && <Link href={`/studio/${orgId}/listings/new`} className={buttonClass("primary", "sm")}>New listing</Link>}
      </div>
      {rows.length === 0 ? (
        <StateMessage kind="empty" title="No listings yet" body="Drafts you create appear here." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map(({ o, applicants }) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <Link href={`/studio/${orgId}/listings/${o.id}`} className="font-semibold text-navy hover:underline">{o.title}</Link>
              <span className="flex items-center gap-2 text-sm">
                <Badge tone={o.status === "published" ? "success" : o.status === "rejected" || o.status === "suspended" ? "danger" : "neutral"}>{LISTING_STATUS[o.status]}</Badge>
                <Link href={`/studio/${orgId}/applicants?opportunityId=${o.id}`} className="text-purple hover:underline">{applicants} applicant{applicants === 1 ? "" : "s"}</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
