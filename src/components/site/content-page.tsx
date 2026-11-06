import type { ReactNode } from "react";

/** Shared layout for editorial/public content pages. */
export function ContentPage({ eyebrow, title, intro, children }: { eyebrow?: string; title: ReactNode; intro?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-deep">{eyebrow}</p>}
      <h1 className="mt-2 font-serif text-4xl leading-tight text-navy sm:text-5xl">{title}</h1>
      {intro && <p className="mt-4 text-lg text-navy-soft">{intro}</p>}
      <div className="prose-avsar mt-10 space-y-8">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-navy">{title}</h2>
      <div className="mt-2 space-y-3 leading-relaxed text-ink/90">{children}</div>
    </section>
  );
}
