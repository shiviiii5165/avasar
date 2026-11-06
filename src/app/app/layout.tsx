import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Bookmark, Compass, FileText, HelpCircle, Home, LineChart, LogOut, Settings, User } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { unreadCount } from "@/server/services/notifications";

export const metadata: Metadata = { robots: { index: false } };

const PRIMARY = [
  { href: "/app", label: "Home", icon: Home },
  { href: "/app/discover", label: "Opportunities", icon: Compass },
  { href: "/app/applications", label: "Applications", icon: FileText },
  { href: "/app/saved", label: "Saved", icon: Bookmark },
  { href: "/app/profile", label: "Profile", icon: User },
];
const SECONDARY = [
  { href: "/app/insights", label: "Career insights", icon: LineChart },
  { href: "/app/notifications", label: "Notifications", icon: Bell },
  { href: "/app/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle },
];

export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser("/app");
  const unread = await unreadCount(await getDb(), session.identity.id);
  return (
    <div className="min-h-dvh bg-surface-muted">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Logo href="/app" />
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
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:pb-10">
        <nav aria-label="Candidate" className="sticky top-20 hidden w-52 shrink-0 self-start lg:block">
          <ul className="space-y-1">
            {PRIMARY.map((n) => (
              <li key={n.href}><Link href={n.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-navy hover:bg-surface"><n.icon aria-hidden className="size-4 text-purple" />{n.label}</Link></li>
            ))}
          </ul>
          <ul className="mt-6 space-y-1 border-t border-line pt-4">
            {SECONDARY.map((n) => (
              <li key={n.href}><Link href={n.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface hover:text-navy"><n.icon aria-hidden className="size-4" />{n.label}</Link></li>
            ))}
          </ul>
        </nav>
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
      {/* Mobile bottom navigation */}
      <nav aria-label="Candidate (mobile)" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-5">
          {PRIMARY.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-navy-soft">
                <n.icon aria-hidden className="size-5 text-purple" />{n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
