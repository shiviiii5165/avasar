import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { applyAction, contextAnswersAction } from "@/app/actions/candidate";
import { ActionForm, Input, Select, Textarea } from "@/components/forms/action-form";
import { EligibilityPanel } from "@/components/opportunity/fit-panel";
import { Badge, buttonClass, Card, StateMessage } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { matchOpportunity } from "@/server/domain/matching";
import { CONSENT_TEXT, listApplicationsForProfile } from "@/server/services/applications";
import { getOpportunityBySlug, toFacts } from "@/server/services/opportunities";
import { loadProfile, toCandidateFacts } from "@/server/services/profiles";

export const metadata = { title: "Apply" };

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireCandidate(`/app/apply/${slug}`);
  const db = await getDb();
  const o = await getOpportunityBySlug(db, slug);
  if (!o) notFound();
  if (o.applicationMethod === "external") redirect(`/opportunities/${slug}`);
  const profile = (await loadProfile(db, session.profileId))!;
  const existing = (await listApplicationsForProfile(db, session.profileId)).find((a) => a.opportunity.id === o.id);
  if (existing) {
    return <StateMessage kind="empty" title="You've already applied" body="You can follow its progress from your applications." action={<Link href={`/app/applications/${existing.application.id}`} className={buttonClass("primary")}>View application</Link>} />;
  }
  const match = matchOpportunity(toCandidateFacts(profile), toFacts(o));
  const p = profile.profile;
  // Ask only for what this opportunity's hard requirements need and the profile doesn't say (unknown, not failed).
  const unknown = new Set(match.eligibility.checks.filter((c) => c.outcome === "unknown").map((c) => c.key));
  const askYear = unknown.has("graduation_year");
  const askAuth = unknown.has("work_authorization");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/opportunities/${slug}`} className="text-sm font-medium text-muted hover:text-navy">← Back to listing</Link>
        <h1 className="mt-2 font-serif text-3xl text-navy">Apply: {o.title}</h1>
        <p className="text-muted">{o.organizationName}{o.isSample ? " · sample listing (not sent to any employer)" : ""}</p>
      </div>

      <EligibilityPanel result={match.eligibility} />
      {match.eligibility.status === "ineligible" && (
        <p role="alert" className="rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">Your profile doesn&apos;t meet at least one mandatory requirement. You can still apply if you believe your profile is out of date, but the organization will see the same information.</p>
      )}

      {(askYear || askAuth) && (
        <Card>
          <h2 className="text-lg font-semibold text-navy">One more detail for this opportunity</h2>
          <p className="mt-1 text-sm text-muted">Your profile doesn&apos;t include this yet, and the organization requires it. Your answer is saved to your Avsar profile so you won&apos;t be asked again.</p>
          <ActionForm action={contextAnswersAction.bind(null, slug)} submitLabel="Save answer" className="mt-4">
            {askYear && <Input name="graduationYear" label="Graduation year (expected is fine)" type="number" inputMode="numeric" min={1950} max={2045} required />}
            {askAuth && (
              <Select name="workAuthorizedIndia" label="Are you authorized to work in India?" defaultValue="" required>
                <option value="" disabled>Choose</option><option value="yes">Yes</option><option value="no">No</option>
              </Select>
            )}
          </ActionForm>
        </Card>
      )}
      {unknown.has("education") && (
        <p className="text-sm text-muted">This opportunity has an education requirement your shared profile doesn&apos;t show. <Link href="/app/profile" className="font-semibold text-purple hover:underline">Add or confirm your education</Link>, or apply anyway.</p>
      )}

      <Card>
        <ActionForm action={applyAction.bind(null, slug)} submitLabel="Submit application">
          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-navy">Resume to share</legend>
            {profile.resumes.length ? (
              profile.resumes.map(({ resume: r, doc }) => (
                <label key={r.id} className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-purple has-[:checked]:bg-purple-soft">
                  <input type="radio" name="resumeId" value={r.id} defaultChecked={r.isDefault} className="size-4 accent-purple" />
                  <span><span className="font-medium text-navy">{r.label}</span> <span className="text-muted">· {doc.originalName}</span></span>
                  {r.isDefault && <Badge tone="purple">Default</Badge>}
                </label>
              ))
            ) : (
              <p className="text-sm text-muted">No resume uploaded. You can apply without one, or <Link href="/app/profile#resumes" className="font-semibold text-purple hover:underline">upload one first</Link>.</p>
            )}
            {profile.resumes.length > 0 && <label className="flex items-center gap-3 p-1 text-sm"><input type="radio" name="resumeId" value="" className="size-4 accent-purple" /> Don&apos;t attach a resume</label>}
          </fieldset>

          {o.questions.map((q) => (
            <Textarea key={q.key} name={`q_${q.key}`} label={q.label} required={q.required} maxLength={4000} />
          ))}

          <details className="rounded-lg border border-line p-4 text-sm" open>
            <summary className="cursor-pointer font-semibold text-navy">What the organization will receive</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li>{p.fullName ?? "Your name"}{p.headline ? `, ${p.headline}` : ""}{p.city ? ` · ${p.city}` : ""}</li>
              <li>{profile.education.length} education record(s), {profile.experiences.length} experience(s), {profile.projects.length} project(s)</li>
              <li>Skills: {profile.skills.map((s) => s.name).join(", ") || "none listed"}</li>
              <li>Your links and the resume you chose above</li>
            </ul>
            <p className="mt-2 text-xs text-muted">A snapshot is saved with the application, so later profile edits don&apos;t change what you sent. Your email and expected pay are not shared.</p>
          </details>

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-purple" />
            <span>{CONSENT_TEXT}</span>
          </label>
        </ActionForm>
      </Card>
    </div>
  );
}
