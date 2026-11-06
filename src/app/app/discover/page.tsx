import Link from "next/link";

import { OpportunityCard } from "@/components/opportunity/opportunity-card";
import { buttonClass, PageHeader, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { candidateFactsFor, matchAll } from "@/server/services/candidate-context";
import { savedIds } from "@/server/services/engagement";
import { searchOpportunities, searchSchema } from "@/server/services/opportunities";

export const metadata = { title: "Discover" };

const ORDER = { eligible: 0, potentially_eligible: 1, insufficient_information: 2, unavailable: 3, ineligible: 4 } as const;

/** Personalized discovery: every open listing, ranked by explained fit. Ineligible ones stay visible, last. */
export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireCandidate("/app/discover");
  const db = await getDb();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const result = await searchOpportunities(db, searchSchema.parse({ page }));
  const facts = await candidateFactsFor(db, session.profileId);
  const matches = matchAll(facts, result.items);
  const saved = await savedIds(db, session.identity.id);
  const items = [...result.items].sort((a, b) => {
    const ma = matches.get(a.id)!;
    const mb = matches.get(b.id)!;
    return ORDER[ma.eligibility.status] - ORDER[mb.eligibility.status] || (mb.score ?? -1) - (ma.score ?? -1);
  });

  return (
    <div>
      <PageHeader title="Discover" description="Open opportunities ranked by how well they fit your profile. Eligible ones first; every score is explained on the listing." actions={<Link href="/opportunities" className={buttonClass("secondary", "sm")}>Search with filters</Link>} />
      {items.length === 0 ? (
        <StateMessage kind="empty" title="No open opportunities right now" body="New listings are reviewed before publishing. Check back soon." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((o) => {
            const m = matches.get(o.id)!;
            return (
              <li key={o.id} className="flex flex-col gap-2">
                <OpportunityCard o={o} saved={saved.has(o.id)} match={{ score: m.score, eligibility: m.eligibility.status }} />
                {m.reasons[0] && <p className="px-1 text-xs text-muted">Why: {m.reasons.slice(0, 2).join(" · ")}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {result.pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2">
          {page > 1 && <Link href={`/app/discover?page=${page - 1}`} className={buttonClass("secondary", "sm")}>Previous</Link>}
          <span className="px-3 text-sm text-muted">Page {page} of {result.pageCount}</span>
          {page < result.pageCount && <Link href={`/app/discover?page=${page + 1}`} className={buttonClass("secondary", "sm")}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
