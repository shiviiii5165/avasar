import Link from "next/link";
import { CalendarClock, Check, Hourglass, IndianRupee, MapPin, Sprout } from "lucide-react";

import { DismissButton, SaveButton } from "@/components/forms/buttons";
import { FieldChip, fieldStyle } from "@/components/opportunity/field";
import { CATEGORY_LABEL, deadlineLabel, formatComp, placeLabel } from "@/components/opportunity/format";
import { SampleBadge, VerificationBadge } from "@/components/opportunity/opportunity-card";
import { cardHighlight } from "@/server/domain/categories";
import { ELIGIBILITY_LABEL } from "@/server/domain/eligibility";
import type { CareerMatch } from "@/server/intelligence/career-match";
import { STATE_LABEL, statusLabel, type SkillProfileEntry } from "@/server/intelligence/evidence";
import type { OpportunityFull } from "@/server/services/opportunities";

import { STATUS_STYLE } from "./status-style";

const KIND_LABEL = { observed: "From your profile", inferred: "Worked out by Avsar", unknown: "Not known yet" } as const;
const IMPORTANCE = { required: "required", preferred: "nice to have", mentioned: "mentioned in the description" } as const;
const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "unknown");

/**
 * One recommended listing on the career page. Everything shown comes from the listing and the existing match
 * (career-match/v2): its field, the student's skills that cover it, and the one skill most worth building.
 * No percentage or probability is shown; the full explanation stays one tap away.
 */
export function RecommendationCard({ o, match, saved, byName }: { o: OpportunityFull; match: CareerMatch; saved: boolean; byName: Map<string, SkillProfileEntry> }) {
  const { bar } = fieldStyle(match.domain.id);
  const deadline = deadlineLabel(o.deadline);
  const pay = ["job", "internship", "gig"].includes(o.category) || o.compMin !== null || o.compMax !== null ? formatComp(o) : cardHighlight(o.category, (o.details ?? {}) as Record<string, unknown>);
  const met = match.skills.filter((v) => v.supportedBy && v.supportedBy.relation !== "related");
  const related = match.skills.filter((v) => v.supportedBy?.relation === "related");
  const strengthen = match.learnNext[0] ? match.skills.find((v) => v.requirement === match.learnNext[0]) : undefined;
  const direction =
    match.domain.relation === "role" && match.role ? `Matches your goal: ${match.role.title}`
    : match.domain.relation === "same" && match.domain.label ? `In your field: ${match.domain.label}`
    : match.domain.relation === "adjacent" && match.domain.label ? `Close to your field: ${match.domain.label}, a good way to explore`
    : null;
  const labelFor = (v: (typeof match.skills)[number]) => {
    const e = byName.get(v.supportedBy!.name);
    return e ? statusLabel(e) : STATE_LABEL[v.supportedBy!.state];
  };

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-shadow duration-150 hover:shadow-lift" data-testid="recommendation">
      <div aria-hidden className={`h-1.5 ${bar}`} />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <FieldChip domainId={match.domain.id} inferred={match.domain.basis === "skills"} />
          <span>{CATEGORY_LABEL[o.category] ?? o.category}</span>
          {o.isSample && <SampleBadge />}
        </div>
        <h3 className="mt-2 text-lg font-semibold leading-snug text-navy">
          <Link href={`/opportunities/${o.slug}`} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-purple">{o.title}</Link>
        </h3>
        <p className="text-sm text-muted">{o.organizationName}</p>

        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm text-navy-soft sm:grid-cols-2">
          <div className="flex min-w-0 items-center gap-2"><MapPin aria-hidden className="size-4 shrink-0 text-muted" /><dt className="sr-only">Location and work mode</dt><dd className="truncate">{placeLabel(o)}</dd></div>
          {pay && <div className="flex min-w-0 items-center gap-2"><IndianRupee aria-hidden className="size-4 shrink-0 text-muted" /><dt className="sr-only">{o.category === "internship" ? "Stipend" : "Pay"}</dt><dd className="truncate">{pay}</dd></div>}
          {o.durationWeeks ? <div className="flex items-center gap-2"><Hourglass aria-hidden className="size-4 shrink-0 text-muted" /><dt className="sr-only">Duration</dt><dd>{o.durationWeeks} weeks</dd></div> : null}
          <div className="flex items-center gap-2"><CalendarClock aria-hidden className="size-4 shrink-0 text-muted" /><dt className="sr-only">Deadline</dt><dd className={deadline.urgent ? "font-semibold text-orange-deep" : ""}>{deadline.text}</dd></div>
        </dl>

        <div className="mt-4 rounded-lg bg-surface-muted/70 p-3">
          <p className="text-sm font-semibold text-navy">Why this fits you</p>
          <ul className="mt-1.5 space-y-1.5 text-sm text-navy-soft">
            {direction && <li className="flex gap-1.5"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />{direction}</li>}
            {met.length > 0 && (
              <li className="flex gap-1.5">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                <span className="min-w-0">
                  You have
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {met.slice(0, 4).map((v) => (
                      <span key={v.requirement} className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs ring-1 ring-line" title={labelFor(v)}>
                        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: STATUS_STYLE[v.supportedBy!.state].dot }} />
                        <span className="truncate font-semibold text-navy">{v.requirement}</span>
                        <span className="shrink-0 text-muted">· {labelFor(v)}</span>
                      </span>
                    ))}
                    {met.length > 4 && <span className="self-center text-xs text-muted">and {met.length - 4} more</span>}
                  </span>
                </span>
              </li>
            )}
            {related.slice(0, 1).map((v) => (
              <li key={v.requirement} className="flex gap-1.5 text-muted">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 opacity-60" />
                Your {v.supportedBy!.name} is related to {v.requirement}, so it counts only partly
              </li>
            ))}
            {!direction && !met.length && !related.length && <li className="text-muted">{match.score === null ? "Add skills to your profile so this listing can be compared with them." : "Your preferences (place, work mode, type) fit this listing."}</li>}
          </ul>
          {strengthen && (
            <p className="mt-2 flex gap-1.5 border-t border-line pt-2 text-sm">
              <Sprout aria-hidden className="mt-0.5 size-4 shrink-0 text-orange-deep" />
              <span>
                <span className="font-semibold text-navy">Skill to strengthen: {strengthen.requirement}</span>
                <span className="text-muted"> · {IMPORTANCE[strengthen.importance]}{strengthen.via ? ` · builds on your ${strengthen.via}` : ""}</span>
              </span>
            </p>
          )}
        </div>

        <details className="group mt-2 text-sm">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center font-semibold text-purple underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-purple [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Full explanation</span>
            <span className="hidden group-open:inline">Hide explanation</span>
          </summary>
          <p className="text-xs text-muted">Eligibility: {ELIGIBILITY_LABEL[match.eligibility.status]}. Unknown details are never held against you.</p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {match.explanations.map((e, i) => (
              <li key={i}><span className="font-semibold text-muted">{KIND_LABEL[e.kind]}:</span> <span className="text-navy-soft">{e.text}</span></li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted">
            Source: {o.sourceProvider ?? "Posted on Avsar"}
            {o.sourceUrl && <> · <a href={o.sourceUrl} rel="noopener noreferrer nofollow" target="_blank" className="underline-offset-4 hover:underline">original listing<span className="sr-only"> (opens in a new tab)</span></a></>}
            {" · "}Last checked: {fmt(o.lastCheckedAt ?? o.lastVerifiedAt ?? o.updatedAt)}
          </p>
        </details>

        <div className="mt-auto pt-3">
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <SaveButton opportunityId={o.id} saved={saved} path="/app/career" />
            <DismissButton opportunityId={o.id} title={o.title} />
            <span className="ml-auto"><VerificationBadge level={o.verification} /></span>
          </div>
        </div>
      </div>
    </article>
  );
}
