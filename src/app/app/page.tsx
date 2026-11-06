import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarClock, Sparkles } from "lucide-react";

import { OpportunityCard } from "@/components/opportunity/opportunity-card";
import { Badge, buttonClass, Card, StateMessage } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { upcomingDeadlines } from "@/server/domain/dashboard";
import { APPLICATION_STATUS_LABEL } from "@/server/domain/workflows";
import { listApplicationsForProfile } from "@/server/services/applications";
import { candidateFactsFor, matchAll } from "@/server/services/candidate-context";
import { listSaved } from "@/server/services/engagement";
import { listNotifications } from "@/server/services/notifications";
import { searchOpportunities, searchSchema } from "@/server/services/opportunities";
import { loadProfile } from "@/server/services/profiles";

export const metadata = { title: "Home" };

/** The dashboard answers one question: what is my next useful action? No decorative metrics. */
export default async function CandidateHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const session = await requireUser("/app");
  if (!session.profileId || !session.onboarded) redirect("/app/onboarding");
  const db = await getDb();
  const { welcome } = await searchParams;
  const [profile, apps, saved, notes, open] = await Promise.all([
    loadProfile(db, session.profileId),
    listApplicationsForProfile(db, session.profileId),
    listSaved(db, session.identity.id),
    listNotifications(db, session.identity.id, 5),
    searchOpportunities(db, searchSchema.parse({ page: 1 })),
  ]);
  if (!profile) redirect("/app/onboarding");
  const facts = await candidateFactsFor(db, session.profileId);
  const matches = matchAll(facts, open.items);
  const applied = new Set(apps.map((a) => a.opportunity.id));
  const recommended = open.items
    .filter((o) => !applied.has(o.id) && matches.get(o.id)?.eligibility.status !== "ineligible")
    .sort((a, b) => (matches.get(b.id)?.score ?? -1) - (matches.get(a.id)?.score ?? -1))
    .slice(0, 3);

  const deadlines = upcomingDeadlines(saved, applied, new Date());

  // Skill suggestions: required skills that recur across the listings that fit you best.
  const gapCounts = new Map<string, number>();
  for (const o of open.items.slice(0, 12)) for (const s of matches.get(o.id)?.missingRequiredSkills ?? []) gapCounts.set(s, (gapCounts.get(s) ?? 0) + 1);
  const gaps = [...gapCounts].sort((a, b) => b[1] - a[1]).slice(0, 4);

  const next = profile.completeness.next;
  const active = apps.filter((a) => !["rejected", "withdrawn", "closed", "selected"].includes(a.application.status));
  const firstName = profile.profile.fullName?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-navy sm:text-4xl">{welcome ? `Welcome to Avsar, ${firstName}.` : `Hello, ${firstName}.`}</h1>
        <p className="mt-1 text-sm text-muted">Here&apos;s what would help you most right now.</p>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4 border-purple/20 bg-gradient-to-r from-purple-soft to-peach-soft/60">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple">Your next useful action</p>
          <p className="mt-1 text-lg font-semibold text-navy">{next ? next.action : recommended[0] ? `Look at ${recommended[0].title}` : "Explore new opportunities"}</p>
          <div className="mt-2 flex items-center gap-2 text-sm text-navy-soft">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={profile.completeness.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
              <div className="h-full rounded-full bg-purple" style={{ width: `${profile.completeness.percent}%` }} />
            </div>
            Profile {profile.completeness.percent}% complete
          </div>
        </div>
        <Link href={next ? next.href : recommended[0] ? `/opportunities/${recommended[0].slug}` : "/opportunities"} className={buttonClass("primary")}>
          {next ? "Do it now" : "Take a look"} <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Card>

      <section aria-labelledby="rec-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="rec-title" className="text-lg font-semibold text-navy">Relevant for you</h2>
          <Link href="/app/discover" className="text-sm font-semibold text-purple hover:underline">See all</Link>
        </div>
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
