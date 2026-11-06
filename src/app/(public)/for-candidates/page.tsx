import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage, Section } from "@/components/site/content-page";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "For candidates" };

export default function ForCandidatesPage() {
  return (
    <ContentPage eyebrow="For candidates" title="Built for the start of your career" intro="Students, freshers and early-career people: Avsar is free for you, and always will be for discovering and applying.">
      <Section title="What you get">
        <ul className="list-disc space-y-1 pl-5">
          <li>Jobs, internships and freelance gigs in one place, reviewed by people before they go live.</li>
          <li>A clear eligibility check and an explained match for every listing.</li>
          <li>One profile and resume to apply with, and a tracker for every application.</li>
          <li>Suggestions for the skills and proof that would help you most.</li>
        </ul>
      </Section>
      <Section title="Your privacy">
        <p>Your profile starts private. Uploading a resume never makes you discoverable. You choose whether your profile is shared only with organizations you apply to, or discoverable by verified employers. You can export or delete your data.</p>
      </Section>
      <Section title="Stay safe">
        <p>Genuine employers never ask you to pay a fee to apply, train or join. If a listing does, report it from the listing page and we&apos;ll review it.</p>
      </Section>
      <Link href="/sign-in" className={buttonClass("primary", "lg")}>Create your profile</Link>
    </ContentPage>
  );
}
