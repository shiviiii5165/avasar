import type { Metadata } from "next";
import Link from "next/link";

import { OpportunityFilters } from "@/components/opportunity/filters";
import { OpportunityCard } from "@/components/opportunity/opportunity-card";
import { buttonClass, StateMessage } from "@/components/ui";
import { getSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { candidateFactsFor, matchAll } from "@/server/services/candidate-context";
import { savedIds } from "@/server/services/engagement";
import { searchOpportunities, searchSchema } from "@/server/services/opportunities";

export const metadata: Metadata = { title: "Explore opportunities", description: "Jobs, internships and freelance gigs for students, freshers and early-career people in India." };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ExplorePage({ searchParams }: { searchParams: SP }) {
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== "" && v !== undefined));
  const parsed = searchSchema.safeParse(raw);
  const input = parsed.success ? parsed.data : searchSchema.parse({});
  const db = await getDb();
  const session = await getSession();

  let result: Awaited<ReturnType<typeof searchOpportunities>>;
  try {
    result = await searchOpportunities(db, input);
  } catch (err) {
    console.error("[explore] search failed:", err instanceof Error ? err.message : err);
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <StateMessage kind="unavailable" title="Search is temporarily unavailable" body="Please try again in a moment." action={<Link href="/opportunities" className={buttonClass("secondary")}>Retry</Link>} />
      </div>
    );
  }

  const facts = await candidateFactsFor(db, session?.profileId ?? null);
  const matches = matchAll(facts, result.items);
  const saved = session ? await savedIds(db, session.identity.id) : new Set<string>();
  const items = input.sort === "relevance" && facts ? [...result.items].sort((a, b) => (matches.get(b.id)?.score ?? -1) - (matches.get(a.id)?.score ?? -1)) : result.items;

  const pageHref = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...raw, page: String(p) }) as [string, string][]);
    return `/opportunities?${q}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="font-serif text-4xl text-navy">Explore opportunities</h1>
        <p className="mt-1 text-sm text-muted" aria-live="polite">
          {result.total} open {result.total === 1 ? "opportunity" : "opportunities"}
          {input.sort === "relevance" && !facts ? " · sign in and complete your profile to sort by match" : ""}
        </p>
      </div>
      {!parsed.success && <p role="alert" className="mb-4 rounded-md bg-warning-soft px-4 py-2 text-sm text-warning">Some filters weren&apos;t valid and were ignored.</p>}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside><OpportunityFilters value={input} /></aside>
        <section aria-label="Results">
          {items.length === 0 ? (
            <StateMessage kind="empty" title="No opportunities match these filters" body="Try removing a filter or searching for a broader term." action={<Link href="/opportunities" className={buttonClass("secondary")}>Clear filters</Link>} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((o) => {
                const m = matches.get(o.id);
                return (
                  <li key={o.id}>
                    <OpportunityCard o={o} saved={saved.has(o.id)} match={m ? { score: m.score, eligibility: m.eligibility.status } : null} />
                  </li>
                );
              })}
            </ul>
          )}
          {result.pageCount > 1 && (
            <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2">
              {result.page > 1 && <Link href={pageHref(result.page - 1)} className={buttonClass("secondary", "sm")}>Previous</Link>}
              <span className="px-3 text-sm text-muted">Page {result.page} of {result.pageCount}</span>
              {result.page < result.pageCount && <Link href={pageHref(result.page + 1)} className={buttonClass("secondary", "sm")}>Next</Link>}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
