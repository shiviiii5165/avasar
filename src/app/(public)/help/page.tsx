import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "@/components/site/content-page";

export const metadata: Metadata = { title: "Help center" };

const FAQ: [string, string][] = [
  ["Is Avsar free?", "Yes. Discovering opportunities and applying is free for candidates."],
  ["How do I sign in?", "Choose Sign in and continue with your AI Tathastu account. Avsar never sees your password."],
  ["Who can see my profile?", "Nobody, by default. You can choose to share it only with organizations you apply to, or to be discoverable by verified employers. Change this any time in Settings."],
  ["What does 'Eligible' mean?", "It means your profile meets every mandatory requirement the listing states. 'Potentially eligible' means some requirements can't be checked yet because a detail is missing from your profile."],
  ["What is the match percentage?", "A relative guide to how well your profile fits, explained factor by factor. It isn't a prediction of being hired and never overrides eligibility."],
  ["Why can't I track an external application?", "Some organizations take applications on their own site. Avsar can't see those, so we don't pretend to track them."],
  ["Someone asked me to pay a fee.", "Don't pay. Report the listing from its page; genuine employers never charge candidates."],
  ["How do I delete my account?", "Go to Settings → Delete account. Applications you already submitted stay with the organization as sent."],
  ["What is a sample listing?", "A demonstration listing used while Avsar is being set up. Sample organizations are fictional."],
];

export default function HelpPage() {
  return (
    <ContentPage eyebrow="Help center" title="How can we help?">
      <div className="divide-y divide-line rounded-xl border border-line bg-surface">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group p-5">
            <summary className="cursor-pointer list-none font-semibold text-navy [&::-webkit-details-marker]:hidden">
              <span className="mr-2 inline-block text-purple transition-transform group-open:rotate-90">›</span>{q}
            </summary>
            <p className="mt-2 pl-5 text-sm text-ink/90">{a}</p>
          </details>
        ))}
      </div>
      <p className="text-sm text-muted">Still stuck? <Link href="/contact" className="font-semibold text-purple hover:underline">Contact us</Link>.</p>
    </ContentPage>
  );
}
