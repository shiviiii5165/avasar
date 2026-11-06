import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui";
import { getSession } from "@/server/auth/session";

const NAV = [
  { href: "/opportunities", label: "Explore" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/for-candidates", label: "Candidates" },
  { href: "/for-employers", label: "Employers" },
  { href: "/about", label: "About" },
];

export async function SiteHeader() {
  const session = await getSession();
  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-3 py-2 text-sm font-medium text-navy-soft hover:bg-white/60 hover:text-navy">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {session ? (
            <Link href={session.roles.length ? "/admin" : "/app"} className={buttonClass("secondary", "sm")}>
              {session.roles.length ? "Admin Studio" : "My dashboard"}
            </Link>
          ) : (
            <Link href="/sign-in" className={buttonClass("secondary", "sm")}>Sign in</Link>
          )}
          {/* Mobile menu: native <details>, works without JavaScript and with the keyboard. */}
          <details className="relative md:hidden">
            <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-line bg-white/70 text-navy [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 mt-2 w-56 rounded-lg border border-line bg-surface p-2 shadow-card">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-md px-3 py-2.5 text-sm font-medium text-navy hover:bg-surface-muted">
                  {n.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
