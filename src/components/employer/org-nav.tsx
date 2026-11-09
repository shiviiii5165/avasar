import Link from "next/link";

import { Badge } from "@/components/ui";
import { ORG_ROLE_LABEL } from "@/server/domain/org-permissions";
import type { OrgContext } from "@/server/services/employer";

/** Organization header + section navigation for every Employer Studio page. */
export function OrgNav({ ctx, active }: { ctx: OrgContext; active: "overview" | "listings" | "applicants" | "settings" }) {
  const base = `/studio/${ctx.org.id}`;
  const items = [["overview", base, "Overview"], ["listings", `${base}/listings`, "Listings"], ["applicants", `${base}/applicants`, "Applicants"], ["settings", `${base}/settings`, "Organization"]] as const;
  const v = ctx.org.verificationStatus;
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-serif text-3xl text-navy">{ctx.org.name}</h1>
        <Badge tone={v === "verified" ? "success" : v === "rejected" || v === "suspended" ? "danger" : "neutral"}>{v === "verified" ? "Verified" : v.replace("_", " ")}</Badge>
        <Badge>{ORG_ROLE_LABEL[ctx.role]}</Badge>
      </div>
      {v !== "verified" && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          {v === "pending" || v === "under_review" ? "Avsar is reviewing your verification request. You can keep drafting listings." : v === "suspended" ? "This organization is suspended. You can view your data but can't act." : <>Submitting listings, contacting candidates and changing application status need a verified organization. <Link href={`${base}/settings#verification`} className="font-semibold underline">Request verification</Link></>}
        </p>
      )}
      <nav aria-label="Organization" className="flex flex-wrap gap-1 border-b border-line">
        {items.map(([k, href, label]) => (
          <Link key={k} href={href} aria-current={active === k ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${active === k ? "border-purple text-purple" : "border-transparent text-navy hover:text-purple"}`}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}

export const LISTING_STATUS: Record<string, string> = {
  draft: "Draft", in_review: "With Avsar for review", approved: "Approved, awaiting publication", published: "Live", paused: "Paused",
  closed: "Closed", expired: "Expired", rejected: "Changes requested", suspended: "Suspended by Avsar", imported: "Imported",
};

