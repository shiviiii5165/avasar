import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { OpportunityFilters } from "@/components/opportunity/filters";
import { OpportunityCard } from "@/components/opportunity/opportunity-card";
import { buttonClass, StateMessage } from "@/components/ui";
import { getSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { searchAllowed } from "@/server/rate-limit";
import { discoveryRules, fieldOptions } from "@/server/services/discovery";
import { listOpenOpportunities, liveCategories, searchOpportunities, searchSchema } from "@/server/services/opportunities";

export const metadata: Metadata = { title: "Explore opportunities", description: "Jobs, internships and freelance gigs for students, freshers and early-career people in India." };

type SP = Promise<Record<string, string | string[] | undefined>>;
/** Filters the signed-in Opportunities page understands under the same names. */
const CARRIED = ["q", "category", "field", "workMode", "location", "employmentType", "minComp", "maxExperience", "verified", "paid", "closingWithinDays", "page"] as const;

/**
 * Public Explore. Same canonical listings, field rules, filters and counts as the signed-in Opportunities page
 * (services/opportunities + services/discovery); only the presentation differs. A visitor who is already signed
 * in is taken to their personalized Opportunities page with the same search.
 */
export default async function ExplorePage({ searchParams }: { searchParams: SP }) {
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== "" && v !== undefined)) as Record<string, string>;
  const session = await getSession();
  if (session && !session.roles.length) {
    const carried = new URLSearchParams(CARRIED.filter((k) => raw[k]).map((k) => [k, raw[k]]));
    if (raw.sort === "newest" || raw.sort === "deadline") carried.set("sort", raw.sort);
    redirect(`/app/discover${carried.size ? `?${carried}` : ""}`);
  }

  const parsed = searchSchema.safeParse(raw);
  const input = parsed.success ? parsed.data : searchSchema.parse({});
  const db = await getDb();
  const rl = await searchAllowed(db, await headers(), session?.identity.id ?? null);
  if (!rl.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <StateMessage kind="unavailable" title="Too many searches in a short time" body={`Please wait about ${rl.retryAfterSec} seconds and try again.`} />
      </div>
    );
  }

  const rules = discoveryRules(input);
  let result: Awaited<ReturnType<typeof searchOpportunities>>;
  let open: Awaited<ReturnType<typeof listOpenOpportunities>>;
  let categories: string[];
  try {
    // "Best match" needs a profile: signed out, the list is newest first (the page says so).
    const sort = input.sort === "deadline" ? "deadline" : "newest";
    [result, open, categories] = await Promise.all([
      searchOpportunities(db, { ...rules.dbQuery(input), sort }, new Date(), rules.keep),
      listOpenOpportunities(db),
      liveCategories(db).catch(() => ["job", "internship", "gig"]),
    ]);
  } catch (err) {
    console.error("[explore] search failed:", err instanceof Error ? err.message : err);
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <StateMessage kind="unavailable" title="Search is temporarily unavailable" body="Please try again in a moment." action={<Link href="/opportunities" className={buttonClass("secondary")}>Retry</Link>} />
      </div>
    );
  }
  const items = result.items;
  const filtered = Boolean(input.q || input.category || input.field || input.workMode || input.location || input.employmentType || input.minComp !== undefined || input.maxExperience !== undefined || input.verified || input.paid || input.closingWithinDays);

  const pageHref = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...raw, page: String(p) }) as [string, string][]);
    return `/opportunities?${q}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl text-navy">Explore opportunities</h1>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {result.total} open {result.total === 1 ? "opportunity" : "opportunities"}
            {rules.intent ? <> · searching the {rules.intent.label} field too</> : null}
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple/20 bg-purple-soft/40 px-5 py-4">
        <p className="flex items-start gap-2 text-sm text-navy">
          <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-purple" />
          <span><span className="font-semibold">See the ones that fit you first.</span> Sign in with AI Tathastu and Avsar matches these to your skills and career goal, and explains why.</span>
        </p>
        <Link href="/sign-in?returnTo=%2Fapp%2Fdiscover" className={buttonClass("primary", "sm")}>Continue with AI Tathastu</Link>
      </div>

      {!parsed.success && <p role="alert" className="mb-4 rounded-md bg-warning-soft px-4 py-2 text-sm text-warning">Some filters weren&apos;t valid and were ignored.</p>}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside><OpportunityFilters value={{ ...input, sort: input.sort === "relevance" ? "newest" : input.sort }} categories={categories} fields={fieldOptions(open, rules.fieldOf, input.field)} /></aside>
        <section aria-label="Results">
          {items.length === 0 ? (
            filtered ? (
              <StateMessage kind="empty" title="No opportunities match these filters" body="Try removing a filter or searching for a broader term." action={<Link href="/opportunities" className={buttonClass("secondary")}>Clear filters</Link>} />
            ) : (
              <StateMessage kind="empty" title="No open opportunities right now" body="New listings appear here as soon as they're checked. Sign in so Avsar can tell you when one fits." />
            )
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="explore-results">
              {items.map((o) => (
                <li key={o.id} className="min-w-0">
                  <OpportunityCard o={o} />
                </li>
              ))}
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
