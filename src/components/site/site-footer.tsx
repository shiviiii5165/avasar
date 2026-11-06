import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";

const COLUMNS = [
  { title: "Product", links: [["/opportunities", "Explore opportunities"], ["/how-it-works", "How it works"], ["/for-candidates", "For candidates"], ["/for-employers", "For employers"], ["/for-institutions", "For institutions"]] },
  { title: "Support", links: [["/help", "Help center"], ["/contact", "Contact"], ["/about", "About Avsar"]] },
  { title: "Legal", links: [["/privacy", "Privacy policy"], ["/terms", "Terms and conditions"]] },
] as const;

export function BrandSignature({ className = "" }: { className?: string }) {
  return (
    <p className={`inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-navy-soft uppercase ${className}`}>
      <LogoMark className="size-4" /> Avsar <span className="font-normal normal-case tracking-normal text-muted">— Open to what&apos;s next.</span>
    </p>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ivory-deep/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="space-y-3">
          <BrandSignature />
          <p className="max-w-xs text-sm text-muted">Every dream deserves a chance. One place, equal opportunity.</p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-semibold text-navy">{c.title}</h2>
            <ul className="mt-3 space-y-2">
              {c.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-muted hover:text-navy">{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-muted">© {new Date().getFullYear()} Avsar. Candidate access is free.</p>
    </footer>
  );
}
