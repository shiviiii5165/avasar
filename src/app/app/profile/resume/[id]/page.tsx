import Link from "next/link";

import { applyResumeAction } from "@/app/actions/resume";
import { ActionForm } from "@/components/forms/action-form";
import { Card, PageHeader, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import type { ResumeExtraction } from "@/server/ai/types";
import { ResumeIntelError, suggestFromResume } from "@/server/services/resume-intel";

export const metadata = { title: "Suggestions from your resume" };

const SECTIONS: { key: keyof ResumeExtraction; title: string; label: (v: never) => string }[] = [
  { key: "skills", title: "Skills", label: (v: { name: string }) => v.name as never },
  { key: "education", title: "Education", label: (v: { institution: string; degree?: string | null; graduationYear?: number | null }) => [v.institution, v.degree, v.graduationYear].filter(Boolean).join(" · ") as never },
  { key: "experience", title: "Experience", label: (v: { title: string; organization: string; startDate?: string | null; endDate?: string | null }) => `${v.title}, ${v.organization}${v.startDate ? ` (${v.startDate} – ${v.endDate ?? ""})` : ""}` as never },
  { key: "projects", title: "Projects", label: (v: { title: string }) => v.title as never },
  { key: "certifications", title: "Certifications", label: (v: { name: string; issuer?: string | null }) => [v.name, v.issuer].filter(Boolean).join(" · ") as never },
] as never;

/** Suggestions only. Every item shows the resume line it came from; nothing is saved until the student confirms. */
export default async function ResumeSuggestions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireCandidate(`/app/profile/resume/${id}`);
  let data: Awaited<ReturnType<typeof suggestFromResume>>;
  try {
    data = await suggestFromResume(await getDb(), s.identity.id, s.profileId, id);
  } catch (err) {
    if (err instanceof ResumeIntelError) return <StateMessage kind="error" title="We couldn't read this resume" body={err.message} action={<Link href="/app/profile#resumes" className="font-semibold text-purple hover:underline">Back to profile</Link>} />;
    throw err;
  }
  const { suggestions, rejected, provider, fellBack } = data;
  const total = Object.values(suggestions).reduce((n, l) => n + l.length, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/app/profile#resumes" className="text-sm font-medium text-muted hover:text-navy">← Back to profile</Link>
        <PageHeader title="Suggestions from your resume" description="Tick what's correct and should be on your Avsar profile. Each item shows the line it came from. Nothing changes until you confirm, and your AI Tathastu profile isn't touched." />
      </div>
      <p className="text-xs text-muted">
        Read by {provider === "anthropic" ? "an AI model (contact details removed before sending)" : "Avsar's built-in reader"}.{fellBack ? " The AI service was unavailable, so the built-in reader was used." : ""}
        {rejected > 0 ? ` ${rejected} possible item${rejected > 1 ? "s were" : " was"} left out because ${rejected > 1 ? "they" : "it"} couldn't be matched to your resume's text.` : ""} Suggestions can be incomplete; please check them.
      </p>
      {total === 0 ? (
        <StateMessage kind="empty" title="Nothing new to add" body="Everything we could read from this resume is already on your profile." />
      ) : (
        <Card>
          <ActionForm action={applyResumeAction.bind(null, id)} submitLabel="Add selected to my profile">
            {SECTIONS.map(({ key, title, label }) => suggestions[key].length > 0 && (
              <fieldset key={key} className="space-y-2">
                <legend className="text-sm font-semibold text-navy">{title}</legend>
                {(suggestions[key] as { evidence: string }[]).map((v, i) => (
                  <label key={i} className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-purple has-[:checked]:bg-purple-soft/50">
                    <input type="checkbox" name="item" value={JSON.stringify({ section: key, value: v })} className="mt-0.5 size-4 accent-purple" />
                    <span><span className="font-medium text-navy">{label(v as never)}</span><br /><span className="text-xs text-muted">From your resume: &ldquo;{v.evidence}&rdquo;</span></span>
                  </label>
                ))}
              </fieldset>
            ))}
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
