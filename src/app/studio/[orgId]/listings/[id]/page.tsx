import Link from "next/link";
import { notFound } from "next/navigation";

import { listingTransitionAction, saveListingAction } from "@/app/actions/employer";
import { OpportunityForm } from "@/components/admin/opportunity-form";
import { LISTING_STATUS, OrgNav } from "@/components/employer/org-nav";
import { ActionForm, Input } from "@/components/forms/action-form";
import { Badge, Card } from "@/components/ui";
import { employerListingTransition, orgDenialReason, type OrgPermission, type OrgVerification } from "@/server/domain/org-permissions";
import type { OpportunityStatus } from "@/server/domain/workflows";
import { EmployerError, getOrgOpportunity } from "@/server/services/employer";
import { getOpportunityById } from "@/server/services/opportunities";

import { studioPage } from "../../context";

export const metadata = { title: "Listing" };

const ACTIONS: { to: OpportunityStatus; label: string; perm: OrgPermission; hint: string }[] = [
  { to: "in_review", label: "Submit to Avsar for review", perm: "opportunity.submit", hint: "Avsar checks the listing and publishes it, or asks for changes." },
  { to: "draft", label: "Move back to draft", perm: "opportunity.draft", hint: "Edit it, then submit again." },
  { to: "paused", label: "Pause", perm: "opportunity.pause_close", hint: "Hidden from candidates until you resume it." },
  { to: "published", label: "Resume", perm: "opportunity.pause_close", hint: "Makes the approved listing visible again." },
  { to: "closed", label: "Close", perm: "opportunity.pause_close", hint: "Stops new applications. Existing applicants stay in your pipeline." },
];

export default async function ListingPage({ params, searchParams }: { params: Promise<{ orgId: string; id: string }>; searchParams: Promise<{ saved?: string; moved?: string }> }) {
  const { orgId, id } = await params;
  const { ctx, session, db } = await studioPage(orgId, `/listings/${id}`);
  const row = await getOrgOpportunity(db, session.identity.id, orgId, id).catch((e) => { if (e instanceof EmployerError) notFound(); throw e; });
  const o = (await getOpportunityById(db, row.id))!;
  const { saved, moved } = await searchParams;
  const available = ACTIONS.filter((a) => employerListingTransition(o.status, a.to));
  const v = ctx.org.verificationStatus as OrgVerification;

  return (
    <div className="space-y-6">
      <OrgNav ctx={ctx} active="listings" />
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold text-navy">{o.title}</h2>
        <Badge>{LISTING_STATUS[o.status]}</Badge>
        {o.status === "published" && <Link href={`/opportunities/${o.slug}`} className="text-sm font-semibold text-purple hover:underline">View public page</Link>}
      </div>
      {saved && <p role="status" className="rounded-md bg-success-soft px-4 py-2 text-sm text-success">Draft saved.</p>}
      {moved && <p role="status" className="rounded-md bg-success-soft px-4 py-2 text-sm text-success">Status changed to: {LISTING_STATUS[moved] ?? moved}.</p>}

      <Card>
        <h3 className="font-semibold text-navy">Status</h3>
        {available.length ? (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {available.map((a) => {
              const why = orgDenialReason(ctx.role, a.perm, v);
              return why ? (
                <p key={a.to} className="rounded-lg border border-dashed border-line p-3 text-sm text-muted"><span className="font-semibold text-navy">{a.label}:</span> {why}</p>
              ) : (
                <ActionForm key={a.to} action={listingTransitionAction.bind(null, orgId, o.id, a.to)} submitLabel={a.label} className="rounded-lg border border-line p-3">
                  <p className="text-xs text-muted">{a.hint}</p>
                  <Input id={`reason-${a.to}`} name="reason" label="Note (optional)" maxLength={300} />
                </ActionForm>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">{o.status === "in_review" || o.status === "approved" ? "With Avsar. You'll see the outcome here." : "No changes available from this status."}</p>
        )}
      </Card>

      <Card>
        <h3 className="mb-4 font-semibold text-navy">Details</h3>
        {o.status === "draft" && ctx.can("opportunity.draft") ? (
          <OpportunityForm o={o} action={saveListingAction.bind(null, orgId, o.id)} lockedOrganization={ctx.org.name} />
        ) : (
          <div className="space-y-2 text-sm"><p className="whitespace-pre-line text-ink/90">{o.description}</p><p className="text-muted">Skills: {o.skills.map((s) => s.name).join(", ") || "—"}</p><p className="text-xs text-muted">Only drafts can be edited, so live content is always reviewed content.</p></div>
        )}
      </Card>
    </div>
  );
}
