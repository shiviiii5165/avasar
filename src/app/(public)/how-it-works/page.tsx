import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage, Section } from "@/components/site/content-page";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "How it works", description: "How Avsar helps you discover, understand, improve, apply and track." };

export default function HowItWorksPage() {
  return (
    <ContentPage eyebrow="How it works" title="One journey, start to finish" intro="Avsar is designed around the whole path to an outcome, not just a list of postings.">
      <Section title="1. Discover">
        <p>Search jobs, internships and freelance gigs by skill, location, pay, work mode and deadline. You can browse without an account.</p>
      </Section>
      <Section title="2. Understand eligibility">
        <p>Every listing&apos;s mandatory requirements (education, graduation year, experience, location, work authorization) are checked against your profile. We show which ones you meet, which you don&apos;t, and which we can&apos;t tell yet. Missing information is never counted against you.</p>
      </Section>
      <Section title="3. Understand your fit">
        <p>A separate match explanation shows the skills you share with the listing, what&apos;s missing and which preferences fit. It is a guide, not a verdict: it never overrides eligibility and never decides for an employer.</p>
      </Section>
      <Section title="4. Improve">
        <p>Your dashboard suggests the next useful action, from adding a project that proves a skill to learning one that appears across the roles you want.</p>
      </Section>
      <Section title="5. Apply and track">
        <p>Apply on Avsar with your profile and a resume, or follow the link to the organization&apos;s own site. Applications made on Avsar are tracked from submission to outcome. External applications are clearly marked: we never pretend to track what we can&apos;t see.</p>
      </Section>
      <Link href="/opportunities" className={buttonClass("primary", "lg")}>Explore Opportunities</Link>
    </ContentPage>
  );
}
