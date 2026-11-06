import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ClipboardCheck, Lock, ShieldCheck, Users } from "lucide-react";

import { ContentPage } from "@/components/site/content-page";
import { buttonClass } from "@/components/ui";
import { features } from "@/server/config";

export const metadata: Metadata = { title: "Employer Studio", robots: { index: false } };

const PLANNED = [
  { icon: ShieldCheck, title: "Organization verification", body: "Official domain, authorized representative and documented manual review." },
  { icon: Users, title: "Team roles", body: "Owners, recruiters, hiring managers and viewers, each with only the access they need." },
  { icon: Building2, title: "Publishing with review", body: "Listings you create pass Avsar moderation before they go live." },
  { icon: ClipboardCheck, title: "Applicant management", body: "Shortlisting, assessments and interviews, with every decision made by a person." },
];

/**
 * Employer Studio foundation (Release 6). The domain model exists; the self-service workspace stays closed
 * until verification and safety controls are proven, so no unfinished publishing is exposed to real users.
 */
export default function EmployerStudioPage() {
  const open = features.employerSelfPublishing();
  return (
    <ContentPage eyebrow="Employer Studio" title="Hire early-career talent, responsibly" intro={open ? "Employer Studio is being enabled for invited organizations." : "Employer Studio isn't open yet. Until it is, the Avsar team publishes opportunities for you."}>
      <p className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-navy"><Lock aria-hidden className="size-4 text-purple" /> Self-service publishing is {open ? "in a gated pilot" : "not available"} in this release.</p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {PLANNED.map((p) => (
          <li key={p.title} className="rounded-xl border border-line bg-surface p-5">
            <p.icon aria-hidden className="size-5 text-purple" />
            <h2 className="mt-2 font-semibold text-navy">{p.title}</h2>
            <p className="mt-1 text-sm text-muted">{p.body}</p>
          </li>
        ))}
      </ul>
      <Link href="/contact" className={buttonClass("primary", "lg")}>List an opportunity with us</Link>
    </ContentPage>
  );
}
