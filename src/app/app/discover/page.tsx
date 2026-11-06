import Link from "next/link";

import { OpportunityCard } from "@/components/opportunity/opportunity-card";
import { SyncStatusCard } from "@/components/profile/sync-status";
import { buttonClass, PageHeader, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { rankForBrowse, recommend } from "@/server/domain/recommend";
import { candidateFactsFor, matchAll } from "@/server/services/candidate-context";
import { savedIds } from "@/server/services/engagement";
import { listOpenOpportunities, searchOpportunities, searchSchema, toFacts } from "@/server/services/opportunities";
import { loadProfile } from "@/server/services/profiles";

export const metadata = { title: "Opportunities for you" };

const TABS = [["", "All Opportunities"], ["job", "Jobs"], ["internship", "Internships"], ["gig", "Freelance & Gigs"]] as const;

type SP = Promise<{ category?: string; q?: string; sort?: string; page?: string }>;

/**
 * The signed-in home for opportunities. "Recommended for You" comes first, ranked by explained match
 * among listings whose hard requirements you don't fail (eligibility is separate from the score and
 * never overridden by it). Below it, every listing by category with search and sorting.
 */
export default async function DiscoverPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const session = await requireCandidate("/app/discover");
  const db = await getDb();
  const input = searchSchema.safeParse({ category: sp.category || undefined, q: sp.q || undefined, sort: sp.sort === "match" ? "newest" : sp.sort || "newest", page: sp.page || 1 });
  const query = input.success ? input.data : searchSchema.parse({});
  const byMatch = sp.sort === "match" || !sp.sort;

  const [profile, open, result, saved, facts] = await Promise.all([
    loadProfile(db, session.profileId),
    listOpenOpportunities(db),
    searchOpportunities(db, query),
    savedIds(db, session.identity.id),
    candidateFactsFor(db, session.profileId),
  ]);
  const matches = matchAll(facts, [...open, ...result.items]);

  const asCandidates = (list: typeof open) => list.map((o) => ({ id: o.id, item: o, facts: toFacts(o) }));
  const rec = facts ? recommend(facts, asCandidates(open)) : { picks: [], limited: true };
  const recommended = rec.picks.map((r) => r.item);
  const items = byMatch && facts ? rankForBrowse(facts, asCandidates(result.items)).map((r) => r.item) : result.items;

  const href = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const merged = { category: query.category, q: query.q, sort: sp.sort, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    const s = u.toString();
    return `/app/discover${s ? `?${s}` : ""}`;
  };
  const p = profile?.profile;

  return (
    <div className="space-y-8">
      <PageHeader title="Opportunities for you" description="Picked using the profile you share from AI Tathastu. Every score is explained on the listing." />
      {p && <SyncStatusCard status={p.aitSyncStatus} syncedAt={p.aitSyncedAt} error={p.aitSyncError} provider={session.identity.provider} compact />}

      <section aria-labelledby="rec-title">
        <h2 id="rec-title" className="mb-3 text-xl font-semibold text-navy">Recommended for You</h2>
        {rec.limited && (
          <p className="mb-3 rounded-md bg-surface px-3 py-2 text-sm text-muted">
            Your shared profile has little to match on yet, so these are broadly relevant picks. Sharing skills or education with Avsar on AI Tathastu makes them more personal.
          </p>
        )}
        {recommended.length ? (
          <ul className="grid gap-4 md:grid-cols-3">
            {recommended.map((o) => {
              const m = matches.get(o.id)!;
              return (
                <li key={o.id} className="flex flex-col gap-2">
                  <OpportunityCard o={o} saved={saved.has(o.id)} match={{ score: m.score, eligibility: m.eligibility.status }} />
                  {m.reasons[0] && <p className="px-1 text-xs text-muted">Why: {m.reasons.slice(0, 2).join(" · ")}</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <StateMessage kind="empty" title="No open opportunities right now" body="New listings are reviewed before publishing. Check back soon." />
        )}
      </section>

      <section aria-labelledby="all-title">
        <h2 id="all-title" className="sr-only">Browse opportunities</h2>
        <nav aria-label="Categories" className="flex flex-wrap gap-2 border-b border-line pb-3">
          {TABS.map(([v, l]) => {
            const active = (query.category ?? "") === v;
            return (
              <Link key={l} href={href({ category: v || undefined, page: undefined })} aria-current={active ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${active ? "bg-navy text-white" : "text-navy hover:bg-surface"}`}>{l}</Link>
            );
          })}
        </nav>
        <form method="get" action="/app/discover" className="mt-4 flex flex-wrap items-end gap-3">
          {query.category && <input type="hidden" name="category" value={query.category} />}
          <label className="min-w-0 flex-1 text-sm"><span className="mb-1 block font-semibold text-navy">Search</span>
            <input name="q" defaultValue={query.q ?? ""} placeholder="Role, skill or organization" className="w-full rounded-md border border-line bg-surface px-3 py-2" /></label>
          <label className="text-sm"><span className="mb-1 block font-semibold text-navy">Sort by</span>
            <select name="sort" defaultValue={sp.sort ?? "match"} className="rounded-md border border-line bg-surface px-3 py-2">
              <option value="match">Best match</option><option value="newest">Newest</option><option value="deadline">Closing soon</option>
            </select></label>
          <button className={buttonClass("primary", "md")}>Search</button>
          <Link href="/opportunities" className="text-sm font-semibold text-purple hover:underline">More filters</Link>
        </form>
        <p className="mt-3 text-sm text-muted">{result.total} opportunit{result.total === 1 ? "y" : "ies"}</p>
        {items.length === 0 ? (
          <StateMessage kind="empty" title="Nothing matches that search" body="Try another word or category." />
        ) : (
          <ul className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((o) => {
              const m = matches.get(o.id)!;
              return <li key={o.id}><OpportunityCard o={o} saved={saved.has(o.id)} match={{ score: m.score, eligibility: m.eligibility.status }} /></li>;
            })}
          </ul>
        )}
        {result.pageCount > 1 && (
          <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2">
            {query.page > 1 && <Link href={href({ page: String(query.page - 1) })} className={buttonClass("secondary", "sm")}>Previous</Link>}
            <span className="px-3 text-sm text-muted">Page {query.page} of {result.pageCount}</span>
            {query.page < result.pageCount && <Link href={href({ page: String(query.page + 1) })} className={buttonClass("secondary", "sm")}>Next</Link>}
          </nav>
        )}
      </section>
    </div>
  );
}
