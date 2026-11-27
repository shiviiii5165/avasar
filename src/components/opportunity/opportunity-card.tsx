import Link from "next/link";
import { ArrowRight, Briefcase, CalendarClock, Check, CircleDashed, ExternalLink, Hourglass, IndianRupee, MapPin } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui";
import type { MatchResult } from "@/server/domain/matching";
import { classifyOpportunity } from "@/server/intelligence/domains";
import { registry } from "@/server/intelligence/registry";
import type { OpportunityFull } from "@/server/services/opportunities";

import { DismissButton, SaveButton } from "@/components/forms/buttons";
import { cardHighlight } from "@/server/domain/categories";
import { gridTone, OrgLogo } from "./brand";
import { FieldChip, fieldStyle } from "./field";
import { CATEGORY_LABEL, deadlineLabel, EMPLOYMENT_LABEL, formatComp, placeLabel } from "./format";


export function SampleBadge() {
  return <Badge tone="orange" className="uppercase tracking-wide">Sample listing</Badge>;
}

/** What a card shows about fit. Built from the canonical MatchResult with cardMatch(), so every page says the same. */
export interface CardMatch {
  score: number | null;
  eligibility: string;
  reasons?: string[];
  gap?: string | null;
  domain?: MatchResult["domain"];
  /** Under half of the score could be assessed (e.g. only location): it says so instead of a fit label. */
  limited?: boolean;
  /** Relevance tier (career-match RELEVANCE). Shown as words: the 0–100 score is a relative ordering, not calibrated. */
  tier?: MatchResult["tier"];
}

/** Plain-language fit label. No percentage: the score orders listings but isn't a validated probability. */
export function tierLabel(m: Pick<CardMatch, "tier" | "domain">): { text: string; tone: string; hint: string } {
  if (m.tier === "strong") return { text: "Strong fit", tone: "bg-success-soft text-success", hint: "Your career goal's field, and your evidence covers skills it asks for." };
  if (m.tier === "weak") return { text: "Different field", tone: "bg-surface text-muted", hint: "Outside your career direction, or only general skills in common." };
  if (m.domain?.relation === "adjacent") return { text: "Nearby field", tone: "bg-purple-soft text-purple", hint: "A field next to your goal: a good way to widen your options." };
  return { text: "Good fit", tone: "bg-purple-soft text-purple", hint: "In your direction, or your specific skills fit what it asks for." };
}

/** Career direction first, then skill evidence, then everything else; eligibility lines stay on the detail page. */
const REASON_ORDER = [/^Matches your target role/, /^In your field/, /^Your evidence covers/];
export function cardMatch(m: MatchResult): CardMatch {
  const rank = (r: string) => {
    const i = REASON_ORDER.findIndex((re) => re.test(r));
    return i === -1 ? REASON_ORDER.length : i;
  };
  const reasons = [...m.reasons].filter((r) => !/^(Education|Graduation year|Experience|Location eligibility|Certifications|Work authorization)\b/.test(r)).sort((a, b) => rank(a) - rank(b)).slice(0, 2);
  const near = m.explanations?.find((e) => e.text.startsWith("Close to your field"))?.text;
  if (reasons.length < 2 && near) reasons.push(near);
  const gap = m.missingRequiredSkills.length
    ? `Not yet on your profile: ${m.missingRequiredSkills.slice(0, 2).join(", ")}${m.missingRequiredSkills.length > 2 ? ` +${m.missingRequiredSkills.length - 2}` : ""}`
    : (m.eligibility.status === "insufficient_information" || m.eligibility.status === "potentially_eligible") && m.eligibility.missingInformation[0]
      ? m.eligibility.missingInformation[0]
      : null;
  return { score: m.score, eligibility: m.eligibility.status, reasons, gap, domain: m.domain, limited: m.completeness < 0.5, tier: m.tier };
}

/**
 * The opportunity tile used everywhere: a colourful panel per organization with the pay, the role in large type and
 * an arrow, then the organization's monogram and name with a "View" pill. The whole tile opens the listing; Save and
 * "Not for me" sit above that link so they keep their own click. Why it fits lives on the listing page.
 */
export function OpportunityTile({ o, fit, saved, savedRecordId, path, dismissable = false, index = 0 }: {
  o: OpportunityFull;
  fit?: Pick<CardMatch, "tier" | "domain"> | null;
  /** Pass a value only when the viewer is signed in: it turns the bookmark on. */
  saved?: boolean;
  savedRecordId?: string;
  path?: string;
  dismissable?: boolean;
  /** Position in its grid, for the staggered entrance. */
  index?: number;
}) {
  const tone = gridTone(index);
  const deadline = deadlineLabel(o.deadline);
  const rawPay = ["job", "internship", "gig"].includes(o.category) || o.compMin !== null || o.compMax !== null
    ? formatComp(o)
    : cardHighlight(o.category, (o.details ?? {}) as Record<string, unknown>);
  const kind = [o.employmentType ? EMPLOYMENT_LABEL[o.employmentType] : null, CATEGORY_LABEL[o.category] ?? o.category].filter(Boolean).join(" ");
  // "Not disclosed" says nothing: show what kind of opening it is instead.
  const topLine = rawPay && !/not disclosed/i.test(rawPay) ? rawPay : kind;
  const fitLabel = fit?.tier ? tierLabel(fit) : null;
  const href = `/opportunities/${o.slug}`;
  // The deadline only when it matters (closing soon); "Rolling applications" adds nothing on a tile.
  const meta = [shortPlace(o), deadline.urgent && !deadline.closed ? deadline.text : null].filter(Boolean).join(" · ");

  return (
    <article
      className="tile-in group relative flex h-full flex-col rounded-[1.6rem] border border-black/[0.06] bg-white p-2 shadow-[0_1px_2px_rgba(28,31,74,0.06),0_8px_24px_-12px_rgba(28,31,74,0.18)] transition-[box-shadow,transform] duration-300 ease-out hover:shadow-[0_2px_4px_rgba(28,31,74,0.06),0_22px_44px_-18px_rgba(28,31,74,0.35)] motion-safe:hover:-translate-y-1 focus-within:ring-2 focus-within:ring-purple/50"
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
      data-testid="opportunity-tile"
    >
      {/* AI-era touches: a rotating light ring on hover and a light sweep across the panel (globals.css, reduced-motion safe). */}
      <span aria-hidden className="tile-ring" />
      <div className="tile-shine relative flex min-h-52 flex-1 flex-col overflow-hidden rounded-[1.15rem] px-5 pb-4 pt-4" style={{ backgroundColor: tone.tile }}>
        <div className="flex min-h-8 items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-[#16183a]/70">{topLine}</p>
          {path && saved !== undefined && (
            <div className="relative z-10 -mr-2.5 flex items-center">
              {dismissable && <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"><DismissButton opportunityId={o.id} title={o.title} iconOnly /></span>}
              <SaveButton opportunityId={savedRecordId ?? o.id} saved={saved} path={path} title={o.title} iconOnly />
            </div>
          )}
        </div>
        <div className="mt-5 flex flex-1 items-start gap-4">
          <h3 className="min-w-0 flex-1 text-[1.6rem] font-semibold leading-[1.18] tracking-[-0.015em] text-[#16183a] [overflow-wrap:break-word]">
            <span id={`tile-${o.id}`}>{o.title}</span>
          </h3>
          <ArrowRight aria-hidden className="mt-2 size-5 shrink-0 text-[#16183a] transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.75} />
        </div>
        <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[#16183a]/65">
          {fitLabel && <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: tone.ink }}><span aria-hidden className="ai-pulse size-1.5 rounded-full" style={{ backgroundColor: tone.ink, color: tone.ink }} />{fitLabel.text}</span>}
          {fitLabel && meta && <span aria-hidden>·</span>}
          <span className={deadline.urgent ? "font-semibold text-orange-deep" : undefined}>{meta}</span>
          {o.isSample && <span className="font-semibold uppercase text-orange-deep">· Sample</span>}
          {saved && <span className="sr-only">Saved</span>}
        </p>
      </div>
      <div className="flex items-center gap-3 px-2.5 pb-1.5 pt-3">
        <OrgLogo name={o.organizationName} ink={tone.ink} />
        <p className="min-w-0 flex-1 text-[12.5px] leading-tight">
          <span className="block font-semibold text-[#16183a] [overflow-wrap:anywhere]">{o.organizationName}</span>
          <span className="mt-0.5 block text-[#16183a]/55">{kind}</span>
        </p>
        <span aria-hidden className="shrink-0 rounded-full bg-[#16183a] px-5 py-2 text-[13px] font-semibold text-white transition-colors duration-200 group-hover:bg-black">View</span>
      </div>
      {/* The whole tile opens the listing; Save and "Not for me" sit above it (z-10) and keep their own click. */}
      <Link href={href} aria-labelledby={`tile-${o.id}`} className="absolute inset-0 z-[5] rounded-[1.6rem] focus-visible:outline-none" />
    </article>
  );
}

const MODE_LABEL: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

/** "Remote", "Bengaluru", "Hybrid · Pune +2": the city only, never the full address list. */
function shortPlace(o: OpportunityFull): string {
  const cities = [...new Set(o.locations.map((l) => l.split(",")[0].trim()).filter(Boolean))];
  if (o.workMode === "remote" || cities.length === 0) return MODE_LABEL[o.workMode] ?? "";
  const city = `${cities[0]}${cities.length > 1 ? ` +${cities.length - 1}` : ""}`;
  return o.workMode === "hybrid" ? `Hybrid · ${city}` : city;
}

/** The previous detailed card, kept for callers that pass custom actions. */
export function OpportunityCard({ o, match, saved, actions }: { o: OpportunityFull; match?: CardMatch | null; saved?: boolean; actions?: ReactNode }) {
  const deadline = deadlineLabel(o.deadline);
  // The match carries the field the matcher used; listings shown without a match are classified the same way.
  const field = match?.domain ?? (() => {
    const c = classifyOpportunity(registry(), o);
    return { id: c.domain, basis: c.basis };
  })();
  const { bar } = fieldStyle(field.id);
  const pay = ["job", "internship", "gig"].includes(o.category) || o.compMin !== null || o.compMax !== null
    ? formatComp(o)
    : cardHighlight(o.category, (o.details ?? {}) as Record<string, unknown>);
  const scored = match && match.score !== null;
  const reasons = match?.reasons ?? [];

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-shadow duration-150 hover:shadow-lift focus-within:ring-2 focus-within:ring-purple/40">
      <div aria-hidden className={`h-1 ${bar}`} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <FieldChip domainId={field.id} inferred={field.basis === "skills"} />
          <Badge>{CATEGORY_LABEL[o.category]}</Badge>
          {o.employmentType && <Badge>{EMPLOYMENT_LABEL[o.employmentType]}</Badge>}
          {o.isSample && <SampleBadge />}
          {saved && <Badge tone="orange">Saved</Badge>}
        </div>

        <h3 className="mt-3 text-lg font-semibold leading-snug text-navy">
          <Link href={`/opportunities/${o.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">{o.title}</Link>
        </h3>
        <p className="mt-0.5 text-sm text-muted">{o.organizationName}</p>

        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm text-navy-soft sm:grid-cols-2">
          <div className="flex items-center gap-2"><MapPin aria-hidden className="size-4 shrink-0 text-muted" /><dt className="sr-only">Location and work mode</dt><dd className="truncate">{placeLabel(o)}</dd></div>
          {pay && <div className="flex items-center gap-2"><IndianRupee aria-hidden className="size-4 shrink-0 text-muted" /><dt className="sr-only">{o.category === "internship" ? "Stipend" : "Pay"}</dt><dd className="truncate">{pay}</dd></div>}
          {o.durationWeeks ? <div className="flex items-center gap-2"><Hourglass aria-hidden className="size-4 shrink-0 text-muted" /><dt className="sr-only">Duration</dt><dd>{o.durationWeeks} weeks</dd></div> : null}
          <div className="flex items-center gap-2"><CalendarClock aria-hidden className="size-4 shrink-0 text-muted" /><dt className="sr-only">Deadline</dt><dd className={deadline.urgent ? "font-semibold text-orange-deep" : ""}>{deadline.text}</dd></div>
        </dl>

        {scored ? (
          <div className="mt-4 rounded-lg border border-line bg-surface-muted/70 p-3">
            <p className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-navy">Why it fits</span>
              {match!.limited ? (
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted" title="Your profile or this listing has too few details for a reliable match score">Few details to compare</span>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tierLabel(match!).tone}`} title={tierLabel(match!).hint}>
                  {tierLabel(match!).text}{match!.eligibility === "ineligible" ? " · not eligible" : ""}
                </span>
              )}
            </p>
            {reasons.length > 0 && (
              <ul className="mt-1.5 space-y-1 text-xs text-ink/85">
                {reasons.map((r) => (
                  <li key={r} className="flex gap-1.5"><Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" /><span className="line-clamp-2">{r}</span></li>
                ))}
              </ul>
            )}
            {match!.gap && (
              <p className="mt-1.5 flex gap-1.5 text-xs text-muted"><CircleDashed aria-hidden className="mt-0.5 size-3.5 shrink-0" /><span className="line-clamp-2">{match!.gap}</span></p>
            )}
          </div>
        ) : (
          o.summary && <p className="mt-3 line-clamp-2 text-sm text-ink/80">{o.summary}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            {o.applicationMethod === "external" ? <ExternalLink aria-hidden className="size-3.5" /> : <Briefcase aria-hidden className="size-3.5" />}
            {o.applicationMethod === "external" ? "Apply on their site" : "Apply on Avsar"}
          </span>
        </div>
        {/* Above the full-card link, so each control keeps its own click and focus. */}
        {actions && <div className="relative z-10 mt-3 flex flex-wrap gap-2 border-t border-line pt-3">{actions}</div>}
      </div>
    </article>
  );
}
