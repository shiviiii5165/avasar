import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";

import { FieldSelect, FilterFields, ShowOnlyFields } from "@/components/opportunity/filters";
import { FieldChip } from "@/components/opportunity/field";
import { cardMatch, OpportunityTile } from "@/components/opportunity/opportunity-card";
import { domainDef } from "@/server/intelligence/domains";
import { discoveryRules, fieldOptions } from "@/server/services/discovery";
import type { MatchResult } from "@/server/domain/matching";
import { SyncStatusCard } from "@/components/profile/sync-status";
import { buttonClass, inputClass, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { headers } from "next/headers";

import { getDb } from "@/server/db/client";
import { searchAllowed } from "@/server/rate-limit";
import { rankForBrowse, recommend } from "@/server/domain/recommend";
import type { Matcher } from "@/server/intelligence/canonical-match";
import { matchAll } from "@/server/services/candidate-context";
import { DismissButton } from "@/components/forms/buttons";
import { dismissedIds, savedIds } from "@/server/services/engagement";
import { categoryDef } from "@/server/domain/categories";
import { byDeadline, canonicalIdSet, recordIdIn, listOpenOpportunities, liveCategories, RANK_LIMIT, rankedPage, searchOpportunities, searchOpportunitiesRanked, searchSchema, toFacts, type OpportunityFull } from "@/server/services/opportunities";
import { matchInputFor } from "@/server/services/career";
import { matcherFor } from "@/server/intelligence/canonical-match";
import { registry } from "@/server/intelligence/registry";
import { loadProfile } from "@/server/services/profiles";

export const metadata = { title: "Opportunities for you" };

/** Filters beyond search, category and sort. Their presence decides which empty state is honest. */
const FILTER_KEYS = ["field", "workMode", "location", "employmentType", "minComp", "maxExperience", "verified", "paid", "closingWithinDays"] as const;
/** Listings per discovery section below "Recommended for you". */
const SECTION_SIZE = 3;
type SP = Promise<Record<string, string | undefined>>;

/**
 * The signed-in home for opportunities. "Recommended for you" comes first, ranked by explained match
 * among listings whose hard requirements you don't fail (eligibility is separate from the score and
 * never overridden by it). Below it, every listing by category with search, filters and sorting.
 */
export default async function DiscoverPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await requireCandidate("/app/discover");
  const db = await getDb();
  const rl = await searchAllowed(db, await headers(), session.identity.id);
  if (!rl.ok) {
    return (
      <div className="py-16">
        <StateMessage kind="unavailable" title="Too many searches in a short time" body={`Please wait about ${rl.retryAfterSec} seconds and try again.`} />
      </div>
    );
  }

  // "Best match" (the default) isn't a database sort: fetch newest-first, then rank by explained match.
  const uiSort = sp.sort === "newest" || sp.sort === "deadline" ? sp.sort : "match";
  const raw = Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined && v !== ""));
  const input = searchSchema.safeParse({ ...raw, sort: uiSort === "match" ? "newest" : uiSort });
  const query = input.success ? input.data : searchSchema.parse({});

  const asCandidates = (list: OpportunityFull[]) => list.map((o) => ({ id: o.id, item: o, facts: toFacts(o) }));
  const byMatch = (facts: Matcher | null, list: OpportunityFull[]) => (facts ? rankForBrowse(facts, asCandidates(list)).map((r) => r.item) : list);
  const unfiltered = !query.q && !query.category && FILTER_KEYS.every((k) => query[k] === undefined);

  // Field and role-intent rules shared with public Explore (services/discovery.ts): same classification everywhere.
  const { fieldOf, intent, keep, dbQuery } = discoveryRules(query);

  // Everything starts at once (one database round trip per step, not one per loader). The profile is loaded once
  // and its matching facts derived from it, instead of loading the same profile a second time.
  const profileP = loadProfile(db, session.profileId);
  const inputP = profileP.then((p) => (p ? matchInputFor(db, p) : null));
  const factsP = inputP.then((i) => (i ? matcherFor(registry(), i.input) : null));
  // Best match ranks the whole filtered set before paging; date sorts page in the database. With no search or
  // filters, the filtered set IS the open listings loaded below, so it isn't fetched a second time.
  // Field and role-intent filters need each listing's classification, so they always take the ranked path.
  const searchP = keep
    ? searchOpportunitiesRanked(db, dbQuery(query), async (list) => (uiSort === "match" ? byMatch(await factsP, list) : uiSort === "deadline" ? byDeadline(list) : list), undefined, keep)
    : uiSort === "match"
      ? unfiltered ? null : searchOpportunitiesRanked(db, query, async (list) => byMatch(await factsP, list))
      : searchOpportunities(db, query, new Date());
  searchP?.catch(() => undefined); // awaited below; this only stops an early failure elsewhere leaving it unhandled
  const [profile, open, savedRecords, facts, live, dismissedRecords, matchInput] = await Promise.all([
    profileP,
    listOpenOpportunities(db, RANK_LIMIT),
    savedIds(db, session.identity.id),
    factsP,
    liveCategories(db),
    dismissedIds(db, session.identity.id),
    inputP,
  ]);
  const target = matchInput?.input;
  const result = searchP
    ? await searchP
    : open.length < RANK_LIMIT
      ? rankedPage(byMatch(facts, open), query.page)
      : await searchOpportunitiesRanked(db, query, (list) => byMatch(facts, list)); // more open listings than one load holds
  // Core tabs always show; other categories only when they have live listings.
  const tabCats = [...new Set(["job", "internship", "gig", ...live])];
  const TABS: [string, string][] = [["", "All"], ...tabCats.map((c) => [c, categoryDef(c)?.plural ?? c] as [string, string])];
  // Unique open listings per category (canonical: the same opening from two feeds counts once).
  const perCategory = new Map<string, number>();
  for (const o of open) perCategory.set(o.category, (perCategory.get(o.category) ?? 0) + 1);
  const tabCount = (v: string) => (v ? perCategory.get(v) ?? 0 : open.length);
  const liveTypes = tabCats.filter((c) => (perCategory.get(c) ?? 0) > 0);
  const matches = matchAll(facts, [...open, ...result.items]);
  // Saves and dismissals made on any record of an opening apply to its canonical card.
  const saved = canonicalIdSet(savedRecords, [...open, ...result.items]);
  const dismissed = canonicalIdSet(dismissedRecords, open);

  const rec = facts ? recommend(facts, asCandidates(open), { exclude: dismissed }) : { picks: [], limited: true };
  const hidden = open.filter((o) => dismissed.has(o.id));
  const recommended = rec.picks.map((r) => r.item);
  const items = result.items;

  // Discovery sections, only from real matches and only when they have something to show.
  const shown = new Set(recommended.map((o) => o.id));
  const pick = (want: (m: MatchResult) => boolean) =>
    open
      .filter((o) => !shown.has(o.id) && !dismissed.has(o.id))
      .map((o) => ({ o, m: matches.get(o.id)! }))
      .filter(({ m }) => m.eligibility.status !== "ineligible" && m.eligibility.status !== "unavailable" && want(m))
      .sort((a, b) => (b.m.score ?? -1) - (a.m.score ?? -1) || (a.o.id < b.o.id ? -1 : 1))
      .slice(0, SECTION_SIZE)
      .map(({ o }) => o);
  const inField = facts ? pick((m) => m.domain?.relation === "role" || m.domain?.relation === "same") : [];
  for (const o of inField) shown.add(o.id);
  const nearby = facts ? pick((m) => m.domain?.relation === "adjacent") : [];

  const fields = fieldOptions(open, fieldOf, query.field);

  const activeFilters = FILTER_KEYS.filter((k) => query[k] !== undefined);
  const current: Record<string, string | undefined> = {
    category: query.category,
    q: query.q,
    sort: uiSort === "match" ? undefined : uiSort,
    ...Object.fromEntries(activeFilters.map((k) => [k, String(query[k])])),
  };
  const href = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...over })) if (v) u.set(k, v);
    const s = u.toString();
    return `/app/discover${s ? `?${s}` : ""}`;
  };
  const clearFilters = href({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])), page: undefined });
  const categoryLabel = query.category ? (categoryDef(query.category)?.plural ?? query.category).toLowerCase() : null;
  const p = profile?.profile;

  /** One card, with working actions: open, save, and (on recommendations) "Not for me". Apply is on the details page, after eligibility. */
  const card = (o: OpportunityFull, dismissable: boolean, index = 0) => {
    const m = matches.get(o.id);
    return (
      <OpportunityTile
        o={o}
        fit={m && m.score !== null ? cardMatch(m) : null}
        saved={saved.has(o.id)}
        savedRecordId={recordIdIn(savedRecords, o)}
        path="/app/discover"
        dismissable={dismissable}
        index={index}
      />
    );
  };

  // Exactly one honest empty state, chosen by why the list is empty.
  const emptyState = () => {
    if (query.q && activeFilters.length) {
      return <StateMessage kind="empty" title={`No results for “${query.q}” with these filters`} body="Try removing a filter or searching for a different word." action={<Link href={clearFilters} className={buttonClass("secondary", "sm")}>Clear filters</Link>} />;
    }
    if (query.q) {
      return <StateMessage kind="empty" title={`No results for “${query.q}”`} body={`Try a shorter word, a skill or an organization name${categoryLabel ? `, or look in all categories` : ""}.`} action={<Link href={href({ q: undefined, page: undefined })} className={buttonClass("secondary", "sm")}>Clear search</Link>} />;
    }
    if (activeFilters.length) {
      return <StateMessage kind="empty" title="No opportunities match these filters" body="Open listings exist, but none fit every filter you chose." action={<Link href={clearFilters} className={buttonClass("secondary", "sm")}>Clear filters</Link>} />;
    }
    return <StateMessage kind="empty" title={`No ${categoryLabel ?? "opportunities"} open right now`} body="New listings are checked by a person before they appear. Look in other categories meanwhile." action={<Link href={href({ category: undefined, page: undefined })} className={buttonClass("secondary", "sm")}>See all opportunities</Link>} />;
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="opp-title" className="overflow-hidden rounded-2xl border border-purple/15 bg-gradient-to-br from-purple-soft via-surface to-peach-soft p-5 shadow-card motion-safe:animate-[dialog-in_240ms_ease-out] sm:p-6">
        <h1 id="opp-title" className="font-serif text-3xl text-navy sm:text-4xl">Opportunities for you</h1>
        <p className="mt-1 max-w-2xl text-sm text-navy-soft">Every open listing, matched to the profile you share from AI Tathastu. Open any listing to see exactly why it fits.</p>
        <p className="mt-3 text-sm text-navy" data-testid="opportunity-totals">
          <span className="font-semibold">{open.length}</span> open {open.length === 1 ? "opportunity" : "opportunities"}
          {liveTypes.length > 0 && <> across {liveTypes.map((c, i) => <span key={c}>{i ? (i === liveTypes.length - 1 ? " and " : ", ") : " "}<span className="font-semibold">{(categoryDef(c)?.plural ?? c).toLowerCase()}</span> ({perCategory.get(c)})</span>)}</>}
        </p>
      </section>
      {p && <SyncStatusCard status={p.aitSyncStatus} syncedAt={p.aitSyncedAt} error={p.aitSyncError} provider={session.identity.provider} compact />}
      {target && target.targetSource !== "stated" && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-purple/20 bg-purple-soft/40 px-4 py-3 text-sm text-navy" data-testid="goal-checkpoint">
          {target.targetSource === "inferred" ? (
            <span>Matching you as <span className="font-semibold">{target.targetRoles[0]}</span>, worked out from the skills on your profile.</span>
          ) : (
            <span><span className="font-semibold">Add your career goal</span> so recommendations put your field first. Until then they use your skills only.</span>
          )}
          <Link href="/app/profile#preferences" className="font-semibold text-purple underline-offset-4 hover:underline">{target.targetSource === "inferred" ? "Set your own goal" : "Add goal"}</Link>
        </p>
      )}

      {open.length === 0 ? (
        <StateMessage kind="empty" title="No open opportunities yet" body="Every listing is checked by a person before it is published. New ones will appear here, and on your Home page, as soon as they are approved." />
      ) : (
        <>
          <section aria-labelledby="rec-title">
            <h2 id="rec-title" className="text-xl font-semibold text-navy">Recommended for you</h2>
            {rec.limited && (
              <p className="mt-1 text-sm text-muted">
                Your profile has few details to match on, so these are general picks.{" "}
                <Link href="/app/profile" className="font-semibold text-purple hover:underline">Add skills or education</Link> to make them personal.
              </p>
            )}
            {recommended.length ? (
              <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-5">
                {recommended.map((o, n) => <li key={o.id}>{card(o, true, n)}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">None of the open listings fit your profile closely yet. Browse them all below.</p>
            )}
            {hidden.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold text-navy">Hidden from recommendations ({hidden.length})</summary>
                <ul className="mt-2 space-y-1">
                  {hidden.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/opportunities/${o.slug}`} className="text-navy hover:underline">{o.title} · {o.organizationName}</Link>
                      <DismissButton opportunityId={recordIdIn(dismissedRecords, o)} title={o.title} undo />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {inField.length > 0 && (
            <section aria-labelledby="field-title">
              <h2 id="field-title" className="text-xl font-semibold text-navy">More in your field</h2>
              <p className="mt-1 text-sm text-muted">Listings in the field of your target role, ranked by fit.</p>
              <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-5">
                {inField.map((o, n) => <li key={o.id}>{card(o, true, n)}</li>)}
              </ul>
            </section>
          )}

          {nearby.length > 0 && (
            <section aria-labelledby="nearby-title">
              <h2 id="nearby-title" className="text-xl font-semibold text-navy">Explore nearby fields</h2>
              <p className="mt-1 text-sm text-muted">Close to your direction and worth a look if you want to widen your options.</p>
              <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-5">
                {nearby.map((o, n) => <li key={o.id}>{card(o, true, n)}</li>)}
              </ul>
            </section>
          )}

          <section aria-labelledby="all-title" className="space-y-4">
            <h2 id="all-title" className="text-xl font-semibold text-navy">Browse all</h2>
            <nav aria-label="Categories" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {TABS.map(([v, l]) => {
                const active = (query.category ?? "") === v;
                return (
                  <Link key={l} href={href({ category: v || undefined, page: undefined })} aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-150 ${active ? "bg-navy text-white" : "border border-line bg-surface text-navy hover:bg-surface-muted"}`}>{l}<span className={`tabular-nums text-xs ${active ? "text-white/75" : "text-muted"}`}>{tabCount(v)}</span></Link>
                );
              })}
            </nav>

            <form method="get" action="/app/discover" role="search" aria-label="Search opportunities" className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-card">
              {query.category && <input type="hidden" name="category" value={query.category} />}
              <div className="flex flex-wrap items-end gap-3">
                {fields.length > 0 && (
                  <div className="min-w-0 flex-[0_1_15rem]">
                    <FieldSelect id="dfield" value={query.field} options={fields} className={inputClass} />
                  </div>
                )}
                <div className="relative min-w-0 flex-[1_1_16rem]">
                  <label htmlFor="dq" className="sr-only">Search by role, skill or organization</label>
                  <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <input id="dq" name="q" type="search" defaultValue={query.q ?? ""} placeholder="Role, skill or organization" className={`${inputClass} pl-9`} />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="dsort" className="text-sm font-semibold text-navy">Sort</label>
                  <select id="dsort" name="sort" defaultValue={uiSort} className={`${inputClass} w-auto pr-8`}>
                    <option value="match">Best match</option><option value="newest">Newest</option><option value="deadline">Closing soon</option>
                  </select>
                </div>
                <button className={buttonClass("primary", "md")}>Search</button>
              </div>
              <details open={activeFilters.length > 0} className="group">
                <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full text-sm font-semibold text-purple hover:underline [&::-webkit-details-marker]:hidden">
                  <SlidersHorizontal aria-hidden className="size-4" /> More filters{activeFilters.length ? ` (${activeFilters.length})` : ""}
                </summary>
                <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-3">
                  <FilterFields value={query} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <ShowOnlyFields value={query} />
                  <div className="flex gap-2">
                    {activeFilters.length > 0 && <Link href={clearFilters} className={buttonClass("ghost", "sm")}>Clear filters</Link>}
                    <button className={buttonClass("secondary", "sm")}>Apply filters</button>
                  </div>
                </div>
              </details>
            </form>

            <p className="text-sm text-muted" aria-live="polite">
              {result.total} {result.total === 1 ? "opportunity" : "opportunities"}
              {query.q ? <> for “{query.q}”</> : null}
              {intent ? <> (searching the {domainDef(intent.domain)?.label ?? intent.label} field too)</> : null}
              {query.field ? <> in <FieldChip domainId={query.field} /></> : null}
              {categoryLabel ? <> in {categoryLabel}</> : null}
              {activeFilters.length ? <> · {activeFilters.length} filter{activeFilters.length > 1 ? "s" : ""}</> : null}
            </p>
            {items.length === 0 ? emptyState() : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-5" data-testid="browse-results">
                {items.map((o, n) => <li key={o.id}>{card(o, false, n)}</li>)}
              </ul>
            )}
            {result.pageCount > 1 && (
              <nav aria-label="Pagination" className="flex items-center justify-center gap-2 pt-4">
                {query.page > 1 && <Link href={href({ page: String(query.page - 1) })} className={buttonClass("secondary", "sm")}>Previous</Link>}
                <span className="px-3 text-sm text-muted">Page {query.page} of {result.pageCount}</span>
                {query.page < result.pageCount && <Link href={href({ page: String(query.page + 1) })} className={buttonClass("secondary", "sm")}>Next</Link>}
              </nav>
            )}
          </section>
        </>
      )}
    </div>
  );
}
