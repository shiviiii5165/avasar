import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { Bell, LogOut } from "lucide-react";

import { CandidateShell } from "@/components/candidate/app-shell";
import { NAV_COOKIE } from "@/components/candidate/nav-cookie";
import { RETURN_PATH_HEADER } from "@/server/auth/return-path";
import { requireUser } from "@/server/auth/session";
import { safeReturnTo } from "@/server/auth/tathastu";
import { getDb } from "@/server/db/client";
import { unreadCount } from "@/server/services/notifications";

export const metadata: Metadata = { robots: { index: false } };

export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  // Return to the exact page after sign-in (e.g. /app/apply/<slug>), not the /app home.
  // safeReturnTo keeps it an internal relative path; anything else falls back to /app.
  const session = await requireUser(safeReturnTo((await headers()).get(RETURN_PATH_HEADER)));
  const [unread, jar] = await Promise.all([unreadCount(await getDb(), session.identity.id), cookies()]);
  const headerRight = (
    <div className="flex items-center gap-1">
      {session.roles.length > 0 && <Link href="/admin" className="rounded-full px-3 py-2 text-sm font-medium text-navy hover:bg-surface-muted">Admin Studio</Link>}
      <Link href="/app/notifications" className="relative flex size-10 items-center justify-center rounded-full hover:bg-surface-muted" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <Bell aria-hidden className="size-5 text-navy" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-orange px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
      </Link>
      <form action="/api/auth/logout" method="post">
        <button type="submit" className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-surface-muted hover:text-navy">
          <LogOut aria-hidden className="size-4" /><span className="hidden sm:inline">Sign out</span>
        </button>
      </form>
    </div>
  );
  return (
    <CandidateShell initialCollapsed={jar.get(NAV_COOKIE)?.value === "collapsed"} unread={unread} headerRight={headerRight}>
      {children}
    </CandidateShell>
  );
}
