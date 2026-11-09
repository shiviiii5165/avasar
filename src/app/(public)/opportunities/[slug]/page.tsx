import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";

import { SaveButton } from "@/components/forms/buttons";
import { EligibilityPanel, MatchPanel, SignInToSeeFit } from "@/components/opportunity/fit-panel";
import { CATEGORY_LABEL, deadlineLabel, EMPLOYMENT_LABEL, formatComp, placeLabel } from "@/components/opportunity/format";
import { OpportunityCard, SampleBadge, VerificationBadge } from "@/components/opportunity/opportunity-card";
import { ReportForm } from "@/components/opportunity/report-form";
import { Badge, buttonClass } from "@/components/ui";
import { getSession } from "@/server/auth/session";
import { describeDetails } from "@/server/domain/categories";
import { getDb } from "@/server/db/client";
import { evaluateEligibility } from "@/server/domain/eligibility";
import { matchOpportunity } from "@/server/domain/matching";
import { candidateFactsFor } from "@/server/services/candidate-context";
import { recordView, savedIds, toggleSaved } from "@/server/services/engagement";
import { getOpportunityBySlug, similarOpportunities, toFacts } from "@/server/services/opportunities";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const o = await getOpportunityBySlug(await getDb(), (await params).slug);
  if (!o) return { title: "Opportunity not found", robots: { index: false } };
  return {
    title: `${o.title} at ${o.organizationName}`,
    description: o.summary ?? o.description.slice(0, 160),
    // Sample listings are demonstration data and must not be indexed.
    robots: o.isSample ? { index: false, follow: false } : undefined,
  };
}

export default async function OpportunityPage({ params, searchParams }: { params: Params; searchParams: Promise<{ intent?: string }> }) {
  const { slug } = await params;
  const { intent } = await searchParams;
  const db = await getDb();
  const o = await getOpportunityBySlug(db, slug);
  if (!o) notFound();
  const session = await getSession();
  const facts = await candidateFactsFor(db, session?.profileId ?? null);
  const oppFacts = toFacts(o);
  const match = facts ? matchOpportunity(facts, oppFacts) : null;
  const eligibility = match?.eligibility ?? evaluateEligibility(null, oppFacts);
  let saved = session ? (await savedIds(db, session.identity.id)).has(o.id) : false;
  // Save-after-sign-in: a signed-out "Save" returns here with intent=save. Saving is idempotent (never un-saves).
  const savedNow = Boolean(session && intent === "save" && !saved);
  if (savedNow && session) saved = await toggleSaved(db, session.identity.id, o.id);
  const signIn = (to: string) => `/sign-in?returnTo=${encodeURIComponent(to)}`;
  if (session) await recordView(db, session.identity.id, o.id).catch(() => undefined);
  const similar = await similarOpportunities(db, o);
  const deadline = deadlineLabel(o.deadline);
  const categoryDetails = describeDetails(o.category, o.details as Record<string, unknown>);
  const jobLike = ["job", "internship", "gig"].includes(o.category);

  // Structured data for search engines: only real (non-sample) published listings.
  const jsonLd = !o.isSample && jobLike && {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: o.title,
    description: o.description,
    datePosted: o.publishedAt?.toISOString(),
    validThrough: o.deadline?.toISOString(),
    hiringOrganization: { "@type": "Organization", name: o.organizationName },
    jobLocationType: o.workMode === "remote" ? "TELECOMMUTE" : undefined,
    jobLocation: o.locations.map((l) => ({ "@type": "Place", address: { "@type": "PostalAddress", addressLocality: l, addressCountry: "IN" } })),
    employmentType: o.category === "internship" ? "INTERN" : o.employmentType?.toUpperCase(),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <Link href="/opportunities" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-navy"><ArrowLeft aria-hidden className="size-4" /> All opportunities</Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_360px]">
        <article>
          <div className="flex flex-wrap gap-2">
            <Badge tone="purple">{CATEGORY_LABEL[o.category]}</Badge>
            {o.employmentType && <Badge>{EMPLOYMENT_LABEL[o.employmentType]}</Badge>}
            <VerificationBadge level={o.verification} />
            {o.isSample && <SampleBadge />}
          </div>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-navy">{o.title}</h1>
          <p className="mt-1 text-lg text-muted">{o.organizationName}</p>
          {o.isSample && (
            <p className="mt-4 flex gap-2 rounded-lg bg-peach-soft px-4 py-3 text-sm text-orange-deep">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" /> This is a sample listing for demonstration. The organization is fictional and applications are not sent to any employer.
            </p>
          )}

          <dl className="mt-6 grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Location</dt><dd className="mt-0.5 text-navy">{placeLabel(o)}</dd></div>
            {(jobLike || o.compMin !== null || o.compMax !== null) && <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Compensation</dt><dd className="mt-0.5 text-navy">{formatComp(o)}</dd></div>}
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Deadline</dt><dd className={`mt-0.5 ${deadline.urgent ? "font-semibold text-orange-deep" : "text-navy"}`}>{deadline.text}</dd></div>
            {o.durationWeeks && <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Duration</dt><dd className="mt-0.5 text-navy">{o.durationWeeks} weeks</dd></div>}
            {o.experienceMinYears !== null && <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Experience</dt><dd className="mt-0.5 text-navy">{o.experienceMinYears === 0 ? "No experience needed" : `${o.experienceMinYears}+ years`}</dd></div>}
            {categoryDetails.map((d) => (
              <div key={d.label} className={d.value.length > 60 ? "sm:col-span-2" : undefined}><dt className="text-xs font-semibold uppercase tracking-wide text-muted">{d.label}</dt><dd className="mt-0.5 whitespace-pre-line text-navy">{d.value}</dd></div>
            ))}
          </dl>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-navy">About the opportunity</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-ink/90">{o.description}</p>
          </section>
          {o.responsibilities && (
            <section className="mt-6">
              <h2 className="text-xl font-semibold text-navy">What you&apos;ll do</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/90">
                {o.responsibilities.split("\n").filter(Boolean).map((r) => <li key={r}>{r}</li>)}
              </ul>
            </section>
          )}
          {o.skills.length > 0 && (
            <section className="mt-6">
              <h2 className="text-xl font-semibold text-navy">Skills</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {o.skills.map((s) => (
                  <li key={s.normalized}><Badge tone={s.required ? "purple" : "neutral"}>{s.name}{s.required ? "" : " · nice to have"}</Badge></li>
                ))}
              </ul>
            </section>
          )}
          <p className="mt-8 text-xs text-muted">
            Source: {o.sourceProvider ?? "Avsar"}{o.lastVerifiedAt ? ` · last checked ${o.lastVerifiedAt.toLocaleDateString("en-IN")}` : ""}. A verification badge reflects our documented checks, not a guarantee of employment.
          </p>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
            {deadline.closed ? (
              <p className="text-sm font-semibold text-danger">Applications are closed.</p>
            ) : o.applicationMethod === "external" ? (
              <>
                <a href={o.externalUrl!} target="_blank" rel="noopener noreferrer nofollow" className={buttonClass("primary", "lg", "w-full")}>
                  Apply on organization&apos;s site <ExternalLink aria-hidden className="size-4" />
                </a>
                <p className="mt-2 text-xs text-muted">You&apos;ll leave Avsar. We can&apos;t submit or track applications made on other sites.</p>
              </>
            ) : session ? (
              <Link href={`/app/apply/${o.slug}`} className={buttonClass("primary", "lg", "w-full")}>Apply on Avsar</Link>
            ) : (
              <Link href={signIn(`/app/apply/${o.slug}`)} className={buttonClass("primary", "lg", "w-full")}>Continue with AI Tathastu to apply</Link>
            )}
            {session ? <div className="mt-3 flex justify-center"><SaveButton opportunityId={o.id} saved={saved} path={`/opportunities/${o.slug}`} /></div> : <Link href={signIn(`/opportunities/${o.slug}?intent=save`)} className={buttonClass("secondary", "sm", "mt-3 w-full")}>Continue with AI Tathastu to save</Link>}
            {savedNow && <p role="status" className="mt-2 text-center text-sm text-success">Saved to your list.</p>}
          </div>
          {match ? <MatchPanel match={match} /> : session ? null : <SignInToSeeFit slug={o.slug} />}
          <EligibilityPanel result={eligibility} />
          {session && <ReportForm opportunityId={o.id} />}
        </aside>
      </div>

      {similar.length > 0 && (
        <section aria-labelledby="similar" className="mt-14">
          <h2 id="similar" className="font-serif text-2xl text-navy">Similar opportunities</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((s) => <li key={s.id}><OpportunityCard o={s} /></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
