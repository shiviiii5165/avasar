import type { Metadata } from "next";

import { ContentPage, Section } from "@/components/site/content-page";

export const metadata: Metadata = { title: "Terms and conditions" };

export default function TermsPage() {
  return (
    <ContentPage eyebrow="Terms" title="Terms and conditions" intro="Draft for founder and legal review. Not yet a reviewed legal document.">
      <Section title="The service">
        <p>Avsar helps you discover opportunities and apply for them. We review listings before publishing, but we don&apos;t employ candidates or guarantee any outcome. A verification badge reflects a documented check, not a guarantee.</p>
      </Section>
      <Section title="Your responsibilities">
        <p>Provide accurate information, keep your account secure, and don&apos;t misuse the platform (spam, impersonation, scraping, or posting misleading content).</p>
      </Section>
      <Section title="Fees">
        <p>Discovering and applying is free for candidates. Never pay anyone who claims to sell jobs through Avsar; report it.</p>
      </Section>
      <Section title="Moderation">
        <p>We may hide, suspend or remove listings and restrict accounts that break these terms or put candidates at risk. Decisions are recorded and can be appealed through Contact.</p>
      </Section>
    </ContentPage>
  );
}
