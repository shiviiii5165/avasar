import type { Metadata } from "next";

import { supportAction } from "@/app/actions/candidate";
import { ActionForm, Input, Textarea } from "@/components/forms/action-form";
import { ContentPage } from "@/components/site/content-page";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const session = await getSession();
  return (
    <ContentPage eyebrow="Contact" title="Talk to us" intro="Questions, feedback, employer enquiries or a safety concern: send us a message and we'll reply by email.">
      <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
        <ActionForm action={supportAction} submitLabel="Send message" resetOnSuccess>
          {!session && <Input name="email" type="email" label="Your email" autoComplete="email" required />}
          <Input name="subject" label="Subject" required maxLength={140} />
          <Textarea name="body" label="Message" required maxLength={4000} />
          {/* Honeypot for bots: hidden from people and assistive technology. */}
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        </ActionForm>
      </div>
    </ContentPage>
  );
}
