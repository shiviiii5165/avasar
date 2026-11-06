import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage, Section } from "@/components/site/content-page";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "For employers" };

export default function ForEmployersPage() {
  return (
    <ContentPage eyebrow="For employers" title="Reach motivated early-career talent" intro="Avsar connects organizations with students, freshers and early-career candidates across India.">
      <Section title="Today">
        <p>During our first release, opportunities are published by the Avsar team. If you have openings for early-career candidates, contact us and we&apos;ll review and list them for you at no cost.</p>
      </Section>
      <Section title="Coming next: Employer Studio">
        <p>Organization verification, team roles, opportunity publishing with review, applicant management, shortlisting and interview coordination. It will open once its verification and safety controls are in place. Hiring decisions always stay with people.</p>
      </Section>
      <Section title="What a verified badge means">
        <p>It means we completed a documented verification process for the organization (such as official domain and authorized representative checks). It isn&apos;t a guarantee of future conduct or of employment.</p>
      </Section>
      <Link href="/contact" className={buttonClass("primary", "lg")}>Talk to us</Link>
    </ContentPage>
  );
}
