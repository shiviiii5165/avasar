import type { Metadata } from "next";

import { ContentPage, Section } from "@/components/site/content-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <ContentPage eyebrow="Privacy" title="Privacy policy" intro="Draft for founder and legal review. This describes how Avsar is built to handle data; it is not yet a reviewed legal document.">
      <Section title="What we collect">
        <p>From AI Tathastu when you sign in: a stable account identifier, and your name and email if your account shares them. From you: the profile details, resumes and applications you choose to add. We record security and audit events needed to run the service safely.</p>
      </Section>
      <Section title="How we use it">
        <p>To show you opportunities, check eligibility, explain matches, submit and track your applications, keep the platform safe and send the notifications you allow. We don&apos;t sell personal data.</p>
      </Section>
      <Section title="Who sees it">
        <p>Your profile is private by default. When you apply, the organization receives the application, the resume you choose and the profile details shown before you submit. Avsar staff access data only for their role (support, trust and safety, verification), and sensitive access is logged.</p>
      </Section>
      <Section title="Your controls">
        <p>Change your visibility, correct your details, export your data and delete your account from Settings. Applications already submitted remain with the organization as sent.</p>
      </Section>
      <Section title="AI and automated processing">
        <p>Matching and eligibility are deterministic and explained on every listing. Automated tools never reject applications. Any future AI features will use only data you&apos;ve provided, disclose uncertainty, and ask you to confirm extracted information before it is saved.</p>
      </Section>
      <Section title="Open items for legal review">
        <p>Jurisdiction-specific requirements (including India&apos;s Digital Personal Data Protection Act), retention periods, grievance officer details and cross-border transfer terms must be confirmed by counsel before launch.</p>
      </Section>
    </ContentPage>
  );
}
