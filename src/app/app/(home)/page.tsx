import Link from "next/link";
import { Bell, CalendarClock, FileText } from "lucide-react";

import { CareerDashboard } from "@/components/career/career-dashboard";
import { SyncStatusCard } from "@/components/profile/sync-status";
import { Badge, Card, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { upcomingDeadlines } from "@/server/domain/dashboard";
import { APPLICATION_STATUS_LABEL } from "@/server/domain/workflows";
import { listApplicationsForProfile } from "@/server/services/applications";
import { careerIntelligence } from "@/server/services/career";
import { dismissedIds, listSaved, savedIds } from "@/server/services/engagement";
import { listNotifications } from "@/server/services/notifications";

export const metadata = { title: "Home" };

/**
 * Home: the student's career dashboard. Career intelligence (skills map, goal skills and next steps, openings that
 * fit) from the one shared implementation, then applications, deadlines and notifications. Browsing every
 * opportunity is on Opportunities (/app/discover).
 */
export default async function CandidateHome() {
  const session = await requireCandidate("/app");
  const db = await getDb();
  const [apps, saved, savedList, notes, dismissed] = await Promise.all([
    listApplicationsForProfile(db, session.profileId),
    savedIds(db, session.identity.id),
    listSaved(db, session.identity.id),
    listNotifications(db, session.identity.id, 5),
    dismissedIds(db, session.identity.id),
  ]);
  const applied = new Set(apps.map((a) => a.opportunity.id));
  // Applied listings aren't recommended again; dismissed ones ("Not for me") never are.
  const data = await careerIntelligence(db, session.profileId, new Date(), { exclude: new Set([...dismissed, ...applied]) });
  if (!data) return <StateMessage kind="error" title="Profile not found" />;
  const p = data.profile;
  const deadlines = upcomingDeadlines(savedList, applied, new Date());
  const active = apps.filter((a) => !["rejected", "withdrawn", "closed", "selected"].includes(a.application.status));
  const firstName = p.fullName?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-navy sm:text-4xl">Hello, {firstName}.</h1>
        <p className="mt-1 text-sm text-muted">Your career goal, your skills and openings that fit you.</p>
      </div>

      <SyncStatusCard status={p.aitSyncStatus} syncedAt={p.aitSyncedAt} error={p.aitSyncError} provider={session.identity.provider} />

      <CareerDashboard data={data} saved={saved} path="/app" />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="rounded-2xl">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-navy"><FileText aria-hidden className="size-4 text-purple" /> Your applications</h2>
            <Link href="/app/applications" className="text-sm font-semibold text-purple hover:underline">All</Link>
          </div>
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

        <Card className="rounded-2xl">
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

        <Card className="rounded-2xl md:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold text-navy"><Bell aria-hidden className="size-4 text-purple" /> Notifications</h2>
            <Link href="/app/notifications" className="text-sm font-semibold text-purple hover:underline">All</Link>
          </div>
          {notes.length ? (
            <ul className="mt-3 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="text-sm">
                  {!n.readAt && <span className="sr-only">Unread: </span>}
                  {n.link ? <Link href={n.link} className={`hover:underline ${n.readAt ? "text-muted" : "font-medium text-navy"}`}>{n.title}</Link> : <span className={n.readAt ? "text-muted" : "font-medium text-navy"}>{n.title}</span>}
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
