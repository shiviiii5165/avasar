import Link from "next/link";
import { CalendarClock, Check, ChevronDown, Hourglass, IndianRupee, MapPin } from "lucide-react";

import { DismissButton, SaveButton } from "@/components/forms/buttons";
import { buttonClass } from "@/components/ui";
import { FieldChip, fieldStyle } from "@/components/opportunity/field";
import { CATEGORY_LABEL, deadlineLabel, formatComp, placeLabel } from "@/components/opportunity/format";
import { SampleBadge, tierLabel } from "@/components/opportunity/opportunity-card";
import { cardHighlight } from "@/server/domain/categories";
import type { CareerMatch } from "@/server/intelligence/career-match";
import type { OpportunityFull } from "@/server/services/opportunities";

/**
 * One "Openings that fit you" card: a clean summary (role, organization, place, pay, duration, deadline), and
 * "Why it fits" one tap away with at most three short reasons, all from the existing match (career-match): the
 * goal/field match, the student's skills it uses, and one listed skill worth learning. No percentages, no
 * verification labels. "View and apply" opens the listing, where the original application link and flow live.
 */
export function RecommendationCard({ o, match, saved, savedRecordId, path = "/app" }: { o: OpportunityFull; match: CareerMatch; saved: boolean; savedRecordId?: string; path?: string }) {
  const { bar } = fieldStyle(match.domain.id);
  const deadline = deadlineLabel(o.deadline);
  const pay = ["job", "internship", "gig"].includes(o.category) || o.compMin !== null || o.compMax !== null ? formatComp(o) : cardHighlight(o.category, (o.details ?? {}) as Record<string, unknown>);
  const usesYour = match.skills.filter((v) => v.supportedBy && v.supportedBy.relation !== "related").map((v) => v.requirement);
  // Only a skill the listing itself asks for (required or preferred), never one merely mentioned in its description.
  const learn = match.learnNext.map((n) => match.skills.find((v) => v.requirement === n)).find((v) => v && v.importance !== "mentioned");
  const direction =
    match.domain.relation === "role" && match.role ? `It matches your goal: ${match.role.title}.`
    : match.domain.relation === "same" && match.domain.label ? `It's in your field: ${match.domain.label}.`
    : match.domain.relation === "adjacent" && match.domain.label ? `It's close to your field (${match.domain.label}), a good way to widen your options.`
    : null;
  const reasons = [
    direction,
    usesYour.length ? `It uses your ${list(usesYour.slice(0, 4))}${usesYour.length > 4 ? " and more" : ""}.` : null,
    learn ? `${learn.requirement} is worth learning for it${learn.importance === "required" ? " (the employer asks for it)" : ""}.` : null,
  ].filter((r): r is string => Boolean(r));
  const fit = match.tier ? tierLabel({ tier: match.tier, domain: match.domain }) : null;

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-[box-shadow,transform] duration-150 hover:shadow-lift motion-safe:hover:-translate-y-0.5" data-testid="recommendation">
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

        {reasons.length > 0 && (
          <details className="group mt-4 rounded-xl bg-surface-muted/70" data-testid="why-it-fits">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-semibold text-navy focus-visible:outline-2 focus-visible:outline-purple [&::-webkit-details-marker]:hidden">
              Why it fits
              {fit && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${fit.tone}`}>{fit.text}</span>}
              <ChevronDown aria-hidden className="ml-auto size-4 text-muted motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-180" />
            </summary>
            <ul className="space-y-1.5 px-3 pb-3 text-sm text-navy-soft">
              {reasons.map((r) => (
                <li key={r} className="flex gap-1.5"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />{r}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Link href={`/opportunities/${o.slug}`} className={buttonClass("primary", "sm")}>View and apply</Link>
            <SaveButton opportunityId={savedRecordId ?? o.id} saved={saved} path={path} />
            <DismissButton opportunityId={o.id} title={o.title} />
          </div>
        </div>
      </div>
    </article>
  );
}

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
