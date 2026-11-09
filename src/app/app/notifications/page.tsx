import Link from "next/link";

import { markNotificationsReadAction } from "@/app/actions/candidate";
import { buttonClass, PageHeader, StateMessage } from "@/components/ui";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listNotifications } from "@/server/services/notifications";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const session = await requireUser("/app/notifications");
  const items = await listNotifications(await getDb(), session.identity.id);
  const unread = items.some((n) => !n.readAt);
  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unread ? `${items.filter((n) => !n.readAt).length} unread` : undefined}
        actions={unread ? <form action={markNotificationsReadAction}><button className={buttonClass("secondary", "sm")}>Mark all as read</button></form> : undefined}
      />
      {items.length === 0 ? (
        <StateMessage kind="empty" title="You're all caught up" body="Updates about your applications and account will appear here." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {items.map((n) => (
            <li key={n.id} className={`flex gap-3 p-4 ${n.readAt ? "" : "bg-purple-soft/40"}`}>
              <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-orange"}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${n.readAt ? "text-navy-soft" : "font-semibold text-navy"}`}>
                  {!n.readAt && <span className="sr-only">Unread: </span>}
                  {n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}
                </p>
                {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
                <p className="mt-1 text-xs text-muted">{n.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted">Choose which updates reach you by email in <Link href="/app/settings" className="font-semibold text-purple hover:underline">Settings</Link>.</p>
    </div>
  );
}
