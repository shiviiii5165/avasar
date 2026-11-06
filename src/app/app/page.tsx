import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Sparkles } from "lucide-react";

import { OpportunityCard } from "@/components/opportunity/opportunity-card";
import { Badge, Card, StateMessage } from "@/components/ui";
import { SyncStatusCard } from "@/components/profile/sync-status";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { upcomingDeadlines } from "@/server/domain/dashboard";
import { APPLICATION_STATUS_LABEL } from "@/server/domain/workflows";
import { listApplicationsForProfile } from "@/server/services/applications";
import { candidateFactsFor, matchAll } from "@/server/services/candidate-context";
import { listSaved } from "@/server/services/engagement";
import { listNotifications } from "@/server/services/notifications";
import { listOpenOpportunities } from "@/server/services/opportunities";
import { loadProfile } from "@/server/services/profiles";

export const metadata = { title: "Home" };

/** The dashboard answers one question: what is my next useful action? No profile-completion checklist. */
export default async function CandidateHome() {
  const session = await requireCandidate("/app");
  const db = await getDb();
  const [profile, apps, saved, notes, open] = await Promise.all([
    loadProfile(db, session.profileId),
    listApplicationsForProfile(db, session.profileId),
    listSaved(db, session.identity.id),
    listNotifications(db, session.identity.id, 5),
    listOpenOpportunities(db),
  ]);
  if (!profile) notFound();
  const facts = await candidateFactsFor(db, session.profileId);
  const matches = matchAll(facts, open);
  const applied = new Set(apps.map((a) => a.opportunity.id));
  const recommended = open
    .filter((o) => !applied.has(o.id) && matches.get(o.id)?.eligibility.status !== "ineligible")
    .sort((a, b) => (matches.get(b.id)?.score ?? -1) - (matches.get(a.id)?.score ?? -1))
    .slice(0, 3);
  // Thin profile: recommendations rest on little data, so say so instead of implying precision.
  const avgCoverage = open.length ? open.reduce((s, o) => s + (matches.get(o.id)?.completeness ?? 0), 0) / open.length : 0;
  const limited = avgCoverage < 0.4;

  const deadlines = upcomingDeadlines(saved, applied, new Date());

  // Skill suggestions: required skills that recur across the listings that fit you best.
  const gapCounts = new Map<string, number>();
  for (const o of recommended.concat(open.slice(0, 12))) for (const s of matches.get(o.id)?.missingRequiredSkills ?? []) gapCounts.set(s, (gapCounts.get(s) ?? 0) + 1);
  const gaps = [...gapCounts].sort((a, b) => b[1] - a[1]).slice(0, 4);

  const active = apps.filter((a) => !["rejected", "withdrawn", "closed", "selected"].includes(a.application.status));
  const firstName = profile.profile.fullName?.split(" ")[0] ?? "there";
  const sync = profile.profile;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-navy sm:text-4xl">Hello, {firstName}.</h1>
        <p className="mt-1 text-sm text-muted">Opportunities picked from the profile you already have on AI Tathastu.</p>
      </div>

      <SyncStatusCard status={sync.aitSyncStatus} syncedAt={sync.aitSyncedAt} error={sync.aitSyncError} provider={session.identity.provider} />
      <section aria-labelledby="rec-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="rec-title" className="text-lg font-semibold text-navy">Recommended for You</h2>
          <Link href="/app/discover" className="text-sm font-semibold text-purple hover:underline">See all</Link>
        </div>
        {limited && (
          <p className="mb-3 rounded-md bg-surface px-3 py-2 text-sm text-muted">
            Your shared profile has little to match on yet, so these are broadly relevant picks. Sharing skills or education with Avsar on AI Tathastu makes them more personal.
          </p>
        )}
        {recommended.length ? (
          <ul className="grid gap-4 md:grid-cols-3">
            {recommended.map((o) => {
              const m = matches.get(o.id)!;
              return <li key={o.id}><OpportunityCard o={o} match={{ score: m.score, eligibility: m.eligibility.status }} /></li>;
            })}
          </ul>
        ) : (
          <StateMessage kind="empty" title="No open opportunities right now" body="New listings are reviewed and published regularly. Check back soon." />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between"><h2 className="font-semibold text-navy">Your applications</h2><Link href="/app/applications" className="text-sm font-semibold text-purple hover:underline">All</Link></div>
          {apps.length ? (
            <ul className="mt-3 divide-y divide-line">
              {apps.slice(0, 4).map(({ application: a, opportunity: o }) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/app/applications/${a.id}`} className="min-w-0 truncate text-sm font-medium text-navy hover:underline">{o.title}</Link>
                  <Badge tone={a.status === "selected" || a.status === "offered" ? "success" : a.status === "rejected" ? "danger" : "purple"}>{APPLICATION_STATUS_LABEL[a.status]}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">You haven&apos;t applied yet. When you do, every step will show here.</p>
          )}
          {active.length > 0 && <p className="mt-2 text-xs text-muted">{active.length} in progress</p>}
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 font-semibold text-navy"><CalendarClock aria-hidden className="size-4 text-orange" /> Upcoming deadlines</h2>
          {deadlines.length ? (
            <ul className="mt-3 divide-y divide-line">
              {deadlines.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/opportunities/${o.slug}`} className="min-w-0 truncate font-medium text-navy hover:underline">{o.title}</Link>
                  <span className="shrink-0 text-orange-deep">{o.deadline!.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Save opportunities to see their deadlines here.</p>
          )}
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 font-semibold text-navy"><Sparkles aria-hidden className="size-4 text-purple" /> Skills to build</h2>
          {gaps.length ? (
            <>
              <ul className="mt-3 flex flex-wrap gap-2">{gaps.map(([s, n]) => <li key={s}><Badge tone="purple">{s} · in {n} listing{n > 1 ? "s" : ""}</Badge></li>)}</ul>
              <Link href="/app/insights" className="mt-3 inline-block text-sm font-semibold text-purple hover:underline">See career insights</Link>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">{profile.skills.length ? "Your skills cover the open listings that fit you." : "Add your skills to see which ones would help most."}</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between"><h2 className="font-semibold text-navy">Notifications</h2><Link href="/app/notifications" className="text-sm font-semibold text-purple hover:underline">All</Link></div>
          {notes.length ? (
            <ul className="mt-3 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="text-sm">
                  {n.link ? <Link href={n.link} className={`hover:underline ${n.readAt ? "text-muted" : "font-medium text-navy"}`}>{n.title}</Link> : <span>{n.title}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No notifications yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
