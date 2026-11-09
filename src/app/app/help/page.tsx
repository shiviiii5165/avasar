import Link from "next/link";

import { HelpFaq } from "@/components/site/help-faq";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Help" };

const QUICK: [string, string, string][] = [
  ["/app/discover", "Find opportunities", "Search, filter and see why a listing fits you."],
  ["/app/applications", "Track an application", "Every status change and message from the hiring team."],
  ["/app/profile", "Update your profile", "What comes from AI Tathastu and what you added here."],
  ["/app/settings", "Privacy and email", "Who can see your profile and which updates reach you."],
];

/** Help inside the signed-in app, so students don't lose their place (the public /help has the same answers). */
export default async function AppHelpPage() {
  await requireUser("/app/help");
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title="Help" description="Quick answers about using Avsar. Can't find yours? Contact us and a person will reply." />
      <ul className="grid gap-3 sm:grid-cols-2">
        {QUICK.map(([href, title, body]) => (
          <li key={href}>
            <Link href={href} className="block h-full rounded-lg border border-line bg-surface p-4 shadow-card hover:border-purple">
              <span className="font-semibold text-navy">{title}</span>
              <span className="mt-1 block text-sm text-muted">{body}</span>
            </Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="faq-title">
        <h2 id="faq-title" className="mb-3 text-lg font-semibold text-navy">Common questions</h2>
        <HelpFaq />
      </section>
      <p className="text-sm text-muted">Still stuck? <Link href="/contact" className="font-semibold text-purple hover:underline">Contact us</Link>.</p>
    </div>
  );
}
