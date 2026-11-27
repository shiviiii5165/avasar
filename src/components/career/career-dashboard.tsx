import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { OpportunityTile } from "@/components/opportunity/opportunity-card";
import type { CareerIntelligence } from "@/server/services/career";
import { hasAnyId, recordIdIn } from "@/server/services/opportunities";

/**
 * Home's opportunity-first view: one slim goal strip (details live on Profile), then "Openings that fit you" as
 * tiles. The skills map and goal skills are on Profile only, so Home and Profile never repeat each other.
 */
export function CareerDashboard({ data, saved, path = "/app" }: { data: CareerIntelligence; saved: ReadonlySet<string>; path?: string }) {
  const { recommendations } = data;
  return (
    <div className="space-y-6">
      <section aria-labelledby="recs-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="recs-title" className="text-xl font-semibold text-navy">Openings that fit you</h2>
          </div>
          <Link href="/app/discover" className="inline-flex items-center gap-1 text-sm font-semibold text-purple underline-offset-4 hover:underline">
            See all opportunities <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        {recommendations.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm text-muted">No open listings fit your profile right now. New listings are added as they are checked; your recommendations update on every visit.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-5" data-testid="recommendations">
            {recommendations.map(({ o, match }, n) => (
              <li key={o.id} className="min-w-0" data-testid="recommendation">
                <OpportunityTile o={o} fit={{ tier: match.tier, domain: match.domain }} saved={hasAnyId(saved, o)} savedRecordId={recordIdIn(saved, o)} path={path} dismissable index={n} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
