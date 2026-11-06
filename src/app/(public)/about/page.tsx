import type { Metadata } from "next";

import { ContentPage, Section } from "@/components/site/content-page";

export const metadata: Metadata = { title: "About", description: "Why Avsar exists and the principles it is built on." };

export default function AboutPage() {
  return (
    <ContentPage eyebrow="About Avsar" title={<>Every dream deserves a <em className="italic text-orange">chance</em>.</>} intro="Avsar is an independent platform that helps people discover opportunities, understand their fit, improve, apply and track their progress, especially people without strong professional networks.">
      <Section title="Why we exist">
        <p>Good opportunities are often found through who you know. Students in smaller cities, first-generation graduates and career switchers rarely get the same access. Avsar puts jobs, internships and freelance work in one place, explains them clearly and helps you take the next useful step.</p>
      </Section>
      <Section title="What we believe">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Candidate first.</strong> Discovering and applying is free.</li>
          <li><strong>Trust before volume.</strong> People review listings before they are published.</li>
          <li><strong>Explainable intelligence.</strong> Every recommendation shows its reasons; software never rejects anyone on its own.</li>
          <li><strong>Privacy by default.</strong> Your profile is private until you choose otherwise.</li>
          <li><strong>Real outcomes.</strong> We measure selections and offers, not clicks.</li>
        </ul>
      </Section>
      <Section title="Part of an ecosystem, independent by design">
        <p>You sign in with your AI Tathastu account, but Avsar is a separate product with its own data, its own security and its own team. Nothing moves between products without an explicit, consented integration.</p>
      </Section>
    </ContentPage>
  );
}
