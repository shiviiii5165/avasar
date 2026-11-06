import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Badge, StateMessage } from "@/components/ui";
import { ADMIN_NAV } from "@/server/auth/admin-gate";
import { requireUser } from "@/server/auth/session";
import { ADMIN_ROLE_LABEL, can } from "@/server/domain/permissions";

export const metadata: Metadata = { title: { default: "Admin Studio", template: "%s · Admin Studio" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser("/admin");
  if (!session.roles.length) {
    return (
      <main id="main" className="mx-auto max-w-xl px-4 py-20">
        <StateMessage kind="forbidden" title="Admin Studio is for Avsar staff" body="Your account doesn't have an admin role." action={<Link href="/app" className="font-semibold text-purple hover:underline">Go to your dashboard</Link>} />
      </main>
    );
  }
  const nav = ADMIN_NAV.filter((n) => !n.permission || can(session.roles, n.permission));
  return (
    <div className="min-h-dvh bg-surface-muted">
      <header className="sticky top-0 z-30 border-b border-line bg-navy text-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/admin" className="text-white" />
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">Admin Studio</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-white/80 sm:inline">{session.identity.name}</span>
            {session.roles.map((r) => <Badge key={r} className="bg-white/15 text-white">{ADMIN_ROLE_LABEL[r]}</Badge>)}
            <form action="/api/auth/logout" method="post"><button className="flex items-center gap-1 rounded-full px-3 py-1.5 hover:bg-white/10"><LogOut aria-hidden className="size-4" /><span className="sr-only sm:not-sr-only">Sign out</span></button></form>
          </div>
        </div>
      </header>
      <div className="flex">
        <nav aria-label="Admin" className="sticky top-[57px] hidden h-[calc(100dvh-57px)] w-56 shrink-0 overflow-y-auto border-r border-line bg-surface p-3 md:block">
          <ul className="space-y-0.5">
            {nav.map((n, i) => (
              <li key={n.href}><Link href={n.href} className="flex gap-2 rounded-md px-3 py-2 text-sm text-navy hover:bg-surface-muted"><span className="w-5 text-right text-xs text-muted">{i + 1}</span>{n.label}</Link></li>
            ))}
          </ul>
        </nav>
        <main id="main" className="min-w-0 flex-1 p-4 sm:p-6">
          <details className="mb-4 md:hidden">
            <summary className="cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-navy">Admin menu</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1">{nav.map((n) => <li key={n.href}><Link href={n.href} className="block rounded-md bg-surface px-3 py-2 text-sm text-navy">{n.label}</Link></li>)}</ul>
          </details>
          {children}
        </main>
      </div>
    </div>
  );
}
