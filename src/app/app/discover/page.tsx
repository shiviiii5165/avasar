import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";

import { FilterFields, ShowOnlyFields } from "@/components/opportunity/filters";
import { OpportunityCard } from "@/components/opportunity/opportunity-card";
import { SyncStatusCard } from "@/components/profile/sync-status";
import { buttonClass, inputClass, PageHeader, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { rankForBrowse, recommend } from "@/server/domain/recommend";
import { candidateFactsFor, matchAll } from "@/server/services/candidate-context";
import { savedIds } from "@/server/services/engagement";
import { categoryDef } from "@/server/domain/categories";
import { listOpenOpportunities, liveCategories, searchOpportunities, searchOpportunitiesRanked, searchSchema, toFacts } from "@/server/services/opportunities";
import { loadProfile } from "@/server/services/profiles";

export const metadata = { title: "Opportunities for you" };

/** Filters beyond search, category and sort. Their presence decides which empty state is honest. */
const FILTER_KEYS = ["workMode", "location", "employmentType", "minComp", "maxExperience", "verified", "paid", "closingWithinDays"] as const;
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
  // "Best match" (the default) isn't a database sort: fetch newest-first, then rank by explained match.
  const uiSort = sp.sort === "newest" || sp.sort === "deadline" ? sp.sort : "match";
  const raw = Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined && v !== ""));
  const input = searchSchema.safeParse({ ...raw, sort: uiSort === "match" ? "newest" : uiSort });
  const query = input.success ? input.data : searchSchema.parse({});

  const [profile, open, saved, facts, live] = await Promise.all([
    loadProfile(db, session.profileId),
    listOpenOpportunities(db),
    savedIds(db, session.identity.id),
    candidateFactsFor(db, session.profileId),
    liveCategories(db),
  ]);
  const asCandidates = (list: typeof open) => list.map((o) => ({ id: o.id, item: o, facts: toFacts(o) }));
  // Best match ranks the whole filtered set before paging; date sorts page in the database.
  const result = uiSort === "match" && facts
    ? await searchOpportunitiesRanked(db, query, (list) => rankForBrowse(facts, asCandidates(list)).map((r) => r.item))
    : await searchOpportunities(db, query);
  // Core tabs always show; other categories only when they have live listings.
  const tabCats = [...new Set(["job", "internship", "gig", ...live])];
  const TABS: [string, string][] = [["", "All"], ...tabCats.map((c) => [c, categoryDef(c)?.plural ?? c] as [string, string])];
  const matches = matchAll(facts, [...open, ...result.items]);

  const rec = facts ? recommend(facts, asCandidates(open)) : { picks: [], limited: true };
  const recommended = rec.picks.map((r) => r.item);
  const items = result.items;

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
      <PageHeader title="Opportunities for you" description="Matched to the profile you share from AI Tathastu. Open any listing to see exactly why it fits." />
      {p && <SyncStatusCard status={p.aitSyncStatus} syncedAt={p.aitSyncedAt} error={p.aitSyncError} provider={session.identity.provider} compact />}

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
              <ul className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {recommended.map((o) => {
                  const m = matches.get(o.id)!;
                  return (
                    <li key={o.id} className="flex flex-col gap-2">
                      <OpportunityCard o={o} saved={saved.has(o.id)} match={{ score: m.score, eligibility: m.eligibility.status }} />
                      {m.reasons[0] && <p className="px-1 text-xs text-muted"><span className="font-semibold text-navy-soft">Why it fits:</span> {m.reasons.slice(0, 2).join(" · ")}</p>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">None of the open listings fit your profile closely yet. Browse them all below.</p>
            )}
          </section>

          <section aria-labelledby="all-title" className="space-y-4">
            <h2 id="all-title" className="text-xl font-semibold text-navy">Browse all</h2>
            <nav aria-label="Categories" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {TABS.map(([v, l]) => {
                const active = (query.category ?? "") === v;
                return (
                  <Link key={l} href={href({ category: v || undefined, page: undefined })} aria-current={active ? "page" : undefined}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${active ? "bg-navy text-white" : "border border-line bg-surface text-navy hover:bg-surface-muted"}`}>{l}</Link>
                );
              })}
            </nav>

            <form method="get" action="/app/discover" role="search" aria-label="Search opportunities" className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-card">
              {query.category && <input type="hidden" name="category" value={query.category} />}
              <div className="flex flex-wrap items-end gap-3">
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
              {categoryLabel ? <> in {categoryLabel}</> : null}
              {activeFilters.length ? <> · {activeFilters.length} filter{activeFilters.length > 1 ? "s" : ""}</> : null}
            </p>
            {items.length === 0 ? emptyState() : (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((o) => {
                  const m = matches.get(o.id)!;
                  return <li key={o.id}><OpportunityCard o={o} saved={saved.has(o.id)} match={{ score: m.score, eligibility: m.eligibility.status }} /></li>;
                })}
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
