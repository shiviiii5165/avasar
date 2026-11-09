import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "@/components/site/content-page";
import { HelpFaq } from "@/components/site/help-faq";

export const metadata: Metadata = { title: "Help center" };

export default function HelpPage() {
  return (
    <ContentPage eyebrow="Help center" title="How can we help?">
      <HelpFaq />
      <p className="text-sm text-muted">Still stuck? <Link href="/contact" className="font-semibold text-purple hover:underline">Contact us</Link>.</p>
    </ContentPage>
  );
}
