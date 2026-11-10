import Link from "next/link";
import { Trash2 } from "lucide-react";

import { deleteSavedSearchAction, saveSearchAction } from "@/app/actions/candidate";
import { OpportunityCard } from "@/components/opportunity/opportunity-card";
import { buttonClass, Card, inputClass, PageHeader, StateMessage } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { isPubliclyVisible } from "@/server/domain/workflows";
import { listRecentlyViewed, listSaved, listSavedSearches } from "@/server/services/engagement";

export const metadata = { title: "Saved" };

export default async function SavedPage() {
  const session = await requireUser("/app/saved");
  const db = await getDb();
  const [saved, searches, recent] = await Promise.all([listSaved(db, session.identity.id), listSavedSearches(db, session.identity.id), listRecentlyViewed(db, session.identity.id)]);
  const open = saved.filter((o) => isPubliclyVisible(o));
  const closed = saved.filter((o) => !isPubliclyVisible(o));

  return (
    <div className="space-y-8">
      <PageHeader title="Saved" description="Opportunities and searches you saved, and listings you viewed recently." />
      <section aria-labelledby="saved-opps">
        <h2 id="saved-opps" className="mb-3 text-lg font-semibold text-navy">Saved opportunities</h2>
        {open.length === 0 && closed.length === 0 ? (
          <StateMessage kind="empty" title="Nothing saved yet" body="Tap Save on any listing to keep it here and see its deadline on your dashboard." action={<Link href="/app/discover" className={buttonClass("primary")}>Find opportunities</Link>} />
        ) : open.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-4">{open.map((o) => <li key={o.id}><OpportunityCard o={o} saved /></li>)}</ul>
        ) : (
          <p className="text-sm text-muted">None of your saved opportunities are open any more. <Link href="/app/discover" className="font-semibold text-purple hover:underline">Find new ones</Link>.</p>
        )}
        {closed.length > 0 && (
          <div className="mt-4 rounded-lg border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-navy">No longer open</p>
            <ul className="mt-2 space-y-1 text-sm text-muted">{closed.map((o) => <li key={o.id}>{o.title} · {o.organizationName} ({o.status === "published" ? "deadline passed" : "closed"})</li>)}</ul>
          </div>
        )}
      </section>

      <section aria-labelledby="saved-searches">
        <h2 id="saved-searches" className="mb-3 text-lg font-semibold text-navy">Saved searches</h2>
        <Card>
          {searches.length ? (
            <ul className="divide-y divide-line">
              {searches.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/app/discover?${new URLSearchParams(s.query)}`} className="text-sm font-medium text-purple hover:underline">{s.name}</Link>
                  <form action={deleteSavedSearchAction.bind(null, s.id)}><button aria-label={`Delete saved search ${s.name}`} className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger"><Trash2 aria-hidden className="size-4" /></button></form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No saved searches yet.</p>
          )}
          <form action={saveSearchAction} className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto]">
            <label className="sr-only" htmlFor="ss-name">Search name</label>
            <input id="ss-name" name="name" placeholder="Name, e.g. Remote internships" className={inputClass} required maxLength={60} />
            <label className="sr-only" htmlFor="ss-q">Keywords</label>
            <input id="ss-q" name="q" placeholder="Keywords (optional)" className={inputClass} maxLength={100} />
            <input type="hidden" name="sort" value="newest" />
            <button className={buttonClass("secondary", "md")}>Save search</button>
          </form>
        </Card>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent">
          <h2 id="recent" className="mb-3 text-lg font-semibold text-navy">Recently viewed</h2>
          <ul className="space-y-1 text-sm">{recent.map((o) => <li key={o.id}><Link href={`/opportunities/${o.slug}`} className="text-purple hover:underline">{o.title}</Link> <span className="text-muted">· {o.organizationName}</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
