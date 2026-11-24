import { ExternalLink } from "lucide-react";

import type { DiscoveryLink } from "@/server/ingestion/discovery";

/** Official-portal searches. Clearly external: these are not Avsar listings and Avsar has not checked them. */
export function OfficialPortalLinks({ links, title = "Also search official portals" }: { links: DiscoveryLink[]; title?: string }) {
  if (!links.length) return null;
  return (
    <section aria-labelledby="portal-links" className="mt-8 rounded-xl border border-line bg-surface p-5">
      <h2 id="portal-links" className="font-semibold text-navy">{title}</h2>
      <p className="mt-1 text-xs text-muted">These open the portal&apos;s own search in a new tab. They aren&apos;t Avsar listings, and Avsar hasn&apos;t checked them.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm hover:border-purple">
              <ExternalLink aria-hidden className="mt-0.5 size-4 shrink-0 text-purple" />
              <span><span className="font-semibold text-navy">{l.label}</span><span className="block text-xs text-muted">{l.portal} · {l.note}</span></span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
