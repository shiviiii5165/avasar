import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogOut } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { requireUser } from "@/server/auth/session";
import { features } from "@/server/config";

export const metadata: Metadata = { title: { default: "Employer Studio", template: "%s · Employer Studio" }, robots: { index: false } };

/** Employer Studio shell. Signed in with an AI Tathastu identity; organization access is checked per page and action. */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  if (!features.employerStudio()) notFound();
  const session = await requireUser("/studio");
  return (
    <div className="min-h-dvh bg-surface-muted">
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo href="/studio" />
            <Link href="/studio" className="rounded-full bg-purple-soft px-2.5 py-0.5 text-xs font-semibold text-purple">Employer Studio</Link>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted sm:inline">{session.identity.name}</span>
            <form action="/api/auth/logout" method="post"><button className="flex items-center gap-1 rounded-full px-3 py-1.5 text-navy hover:bg-surface-muted"><LogOut aria-hidden className="size-4" /><span className="sr-only sm:not-sr-only">Sign out</span></button></form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
