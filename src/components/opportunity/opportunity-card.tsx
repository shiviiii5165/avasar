import Link from "next/link";
import { BadgeCheck, Briefcase, Clock3, ExternalLink, IndianRupee, MapPin } from "lucide-react";

import { Badge } from "@/components/ui";
import type { OpportunityFull } from "@/server/services/opportunities";

import { CATEGORY_LABEL, deadlineLabel, EMPLOYMENT_LABEL, formatComp, placeLabel } from "./format";

export function VerificationBadge({ level }: { level: string }) {
  if (level === "org_verified") return <Badge tone="success"><BadgeCheck aria-hidden className="size-3.5" /> Verified organization</Badge>;
  if (level === "source_verified") return <Badge tone="purple"><BadgeCheck aria-hidden className="size-3.5" /> Source checked</Badge>;
  return <Badge>Unverified</Badge>;
}

export function SampleBadge() {
  return <Badge tone="orange" className="uppercase tracking-wide">Sample listing</Badge>;
}

export function OpportunityCard({ o, match, saved }: { o: OpportunityFull; match?: { score: number | null; eligibility: string } | null; saved?: boolean }) {
  const deadline = deadlineLabel(o.deadline);
  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-line bg-surface p-5 shadow-card transition-shadow hover:shadow-lift">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="purple">{CATEGORY_LABEL[o.category]}</Badge>
        {o.employmentType && <Badge>{EMPLOYMENT_LABEL[o.employmentType]}</Badge>}
        {o.isSample && <SampleBadge />}
        {saved && <Badge tone="orange">Saved</Badge>}
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug text-navy">
        <Link href={`/opportunities/${o.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">{o.title}</Link>
      </h3>
      <p className="mt-0.5 text-sm text-muted">{o.organizationName}</p>
      {o.summary && <p className="mt-3 line-clamp-2 text-sm text-ink/80">{o.summary}</p>}
      <dl className="mt-4 grid gap-1.5 text-sm text-navy-soft">
        <div className="flex items-center gap-2"><MapPin aria-hidden className="size-4 shrink-0 text-muted" /><dt className="sr-only">Location</dt><dd>{placeLabel(o)}</dd></div>
        <div className="flex items-center gap-2"><IndianRupee aria-hidden className="size-4 shrink-0 text-muted" /><dt className="sr-only">Compensation</dt><dd>{formatComp(o)}</dd></div>
        <div className="flex items-center gap-2"><Clock3 aria-hidden className="size-4 shrink-0 text-muted" /><dt className="sr-only">Deadline</dt><dd className={deadline.urgent ? "font-semibold text-orange-deep" : ""}>{deadline.text}</dd></div>
        <div className="flex items-center gap-2">
          {o.applicationMethod === "external" ? <ExternalLink aria-hidden className="size-4 shrink-0 text-muted" /> : <Briefcase aria-hidden className="size-4 shrink-0 text-muted" />}
          <dt className="sr-only">How to apply</dt>
          <dd>{o.applicationMethod === "external" ? "Apply on the organization's site" : "Apply on Avsar"}</dd>
        </div>
      </dl>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <VerificationBadge level={o.verification} />
        {match && match.score !== null && (
          <span className="text-xs font-semibold text-purple">{match.score}% match{match.eligibility === "ineligible" ? " · not eligible" : ""}</span>
        )}
      </div>
    </article>
  );
}
