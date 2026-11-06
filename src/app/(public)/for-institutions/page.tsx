import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage, Section } from "@/components/site/content-page";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "For institutions" };

export default function ForInstitutionsPage() {
  return (
    <ContentPage eyebrow="For institutions" title="Help every student find their next door" intro="Colleges and universities will be able to share opportunities with their students and see aggregated placement progress.">
      <Section title="Planned capabilities">
        <ul className="list-disc space-y-1 pl-5">
          <li>Institution profiles and administrators.</li>
          <li>Opt-in student affiliation and opportunity distribution.</li>
          <li>Aggregated, anonymized placement dashboards.</li>
        </ul>
      </Section>
      <Section title="Students stay in control">
        <p>Institutions will never automatically see an individual student&apos;s private profile or applications. Any sharing will be explicit and opt-in.</p>
      </Section>
      <Link href="/contact" className={buttonClass("primary", "lg")}>Register interest</Link>
    </ContentPage>
  );
}
