import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";

import { SaveButton } from "@/components/forms/buttons";
import { OrgLogo, orgTone } from "@/components/opportunity/brand";
import { OpportunityStory } from "@/components/opportunity/story";
import { SectionBody, SlideBullets, SlideHeading, splitSections, summarizeListing } from "@/components/opportunity/listing-text";
import { EligibilityPanel, MatchPanel, MatchSummary, SignInToSeeFit } from "@/components/opportunity/fit-panel";
import { FieldChip } from "@/components/opportunity/field";
import { classifyOpportunity } from "@/server/intelligence/domains";
import { registry } from "@/server/intelligence/registry";
import { CATEGORY_LABEL, deadlineLabel, EMPLOYMENT_LABEL, formatComp, placeLabel } from "@/components/opportunity/format";
import { OpportunityTile, SampleBadge, tierLabel } from "@/components/opportunity/opportunity-card";
import { ReportForm } from "@/components/opportunity/report-form";
import { Badge, buttonClass } from "@/components/ui";
import { getSession } from "@/server/auth/session";
import { describeDetails } from "@/server/domain/categories";
import { getDb } from "@/server/db/client";
import { evaluateEligibility } from "@/server/domain/eligibility";
import { matcherFor } from "@/server/services/candidate-context";
import { recordView, savedIds, toggleSaved } from "@/server/services/engagement";
import { getOpportunityBySlug, isWebUrl, similarOpportunities, toFacts } from "@/server/services/opportunities";

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
  const matcher = await matcherFor(db, session?.profileId ?? null);
  const oppFacts = toFacts(o);
  const match = matcher ? matcher(oppFacts) : null;
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
  // The matcher's classification when signed in (same as the cards); otherwise the same classifier directly.
  const field = match?.domain ? { domain: match.domain.id, basis: match.domain.basis } : classifyOpportunity(registry(), o);
  const fit = match && match.score !== null && match.tier ? tierLabel(match) : null;
  // Listed skills (not ones Avsar only spotted in the text) that the student isn't missing.
  const missing = new Set([...(match?.missingRequiredSkills ?? []), ...(match?.missingPreferredSkills ?? [])].map((s) => s.toLowerCase()));
  const matchedSkills = match ? o.skills.filter((s) => s.origin !== "text_mentioned" && !missing.has(s.name.toLowerCase())).map((s) => s.name).slice(0, 8) : [];
  const jobType = [CATEGORY_LABEL[o.category], o.employmentType ? EMPLOYMENT_LABEL[o.employmentType] : null].filter(Boolean).join(" · ");
  const pay = jobLike || o.compMin !== null || o.compMax !== null ? formatComp(o) : null;
  const tone = orgTone(o.organizationName);

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

  const stats: { label: string; value: string; className?: string }[] = [
    ...(fit ? [{ label: "Fit", value: fit.text }] : []),
    { label: "Job type", value: jobType },
    { label: "Location", value: placeLabel(o) },
    // Only facts that say something: no "Rolling applications" or "Not disclosed" boxes.
    ...(o.deadline ? [{ label: "Deadline", value: deadline.text, className: deadline.urgent ? "text-orange-deep" : undefined }] : []),
    ...(pay && !/not disclosed/i.test(pay) ? [{ label: o.category === "internship" ? "Stipend" : "Pay", value: pay }] : []),
  ];

  // A short, organized summary instead of the employer's raw text (which stays under "Read the full description").
  const sum = summarizeListing(o.description, { summary: o.summary, responsibilities: o.responsibilities, organization: o.organizationName });
  const facts = [
    placeLabel(o),
    jobType,
    o.experienceMinYears !== null ? (o.experienceMinYears === 0 ? "No experience needed" : `${o.experienceMinYears}+ years experience`) : null,
    o.durationWeeks ? `${o.durationWeeks} weeks` : null,
    pay && !/not disclosed/i.test(pay) ? pay : null,
    o.deadline ? deadline.text : null,
  ].filter((f): f is string => Boolean(f));

  const overview = (
    <section className="space-y-5">
      <SlideHeading>In short</SlideHeading>
      <p className="text-[17px] leading-relaxed text-[#2b2f5c]">{sum.overview || `${o.title} at ${o.organizationName}.`}</p>
      <ul className="flex flex-wrap gap-2">
        {facts.map((f) => <li key={f} className="rounded-full px-3 py-1.5 text-sm font-semibold" style={{ backgroundColor: tone.tile, color: tone.ink }}>{f}</li>)}
      </ul>
    </section>
  );
  const roleSlide = sum.role.length > 0 && (
    <section className="space-y-4">
      <SlideHeading>What you&apos;ll do</SlideHeading>
      <SlideBullets items={sum.role} dot={tone.ink} />
    </section>
  );
  const listedSkills = o.skills.filter((s) => s.origin !== "text_mentioned");
  const needSlide = (sum.need.length > 0 || listedSkills.length > 0 || categoryDetails.length > 0) && (
    <section className="space-y-4">
      <SlideHeading>What they&apos;re looking for</SlideHeading>
      {listedSkills.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {listedSkills.map((s) => <li key={s.normalized}><Badge tone={s.required ? "purple" : "neutral"}>{s.name}{s.required ? "" : " · nice to have"}</Badge></li>)}
        </ul>
      )}
      {sum.need.length > 0 && <SlideBullets items={sum.need} dot={tone.ink} />}
      {categoryDetails.length > 0 && (
        <dl className="grid gap-3 rounded-xl bg-surface-muted/60 p-4 sm:grid-cols-2">
          {categoryDetails.map((d) => <div key={d.label}><dt className="text-xs font-semibold uppercase tracking-wide text-muted">{d.label}</dt><dd className="mt-0.5 whitespace-pre-line text-navy">{d.value}</dd></div>)}
        </dl>
      )}
    </section>
  );
  const whyItFits = (
    <div className="space-y-4">
      {match ? <MatchPanel match={match} /> : session ? <p className="text-sm text-muted">Your profile has too few details to compare with this listing yet.</p> : <SignInToSeeFit slug={o.slug} />}
      <EligibilityPanel result={eligibility} />
    </div>
  );

  const company = (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <OrgLogo name={o.organizationName} />
        <div>
          <p className="font-semibold text-navy">{o.organizationName}</p>
          <p className="text-sm text-muted">{placeLabel(o)}</p>
        </div>
      </div>
      {sum.company && <p className="text-[16px] leading-relaxed text-[#2b2f5c]">{sum.company}</p>}
      <p className="text-sm text-muted">
        Source: {o.sourceProvider ?? "Avsar"}{o.lastVerifiedAt ? ` · last checked ${o.lastVerifiedAt.toLocaleDateString("en-IN")}` : ""}. A verification badge reflects our documented checks, not a guarantee of employment.
      </p>
      {session && <ReportForm opportunityId={o.id} />}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <Link href="/opportunities" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-navy"><ArrowLeft aria-hidden className="size-4" /> All opportunities</Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="flex min-w-0 flex-col rounded-3xl border border-line bg-surface shadow-card">
          <div className="rounded-t-3xl p-5 sm:p-7" style={{ backgroundImage: `linear-gradient(180deg, ${tone.tile} 0%, #ffffff 260px)` }}>
            <div className="flex items-start gap-5">
              <OrgLogo name={o.organizationName} size="lg" ink={tone.ink} />
              <div className="min-w-0">
                <h1 className="font-serif text-2xl leading-tight text-navy sm:text-3xl">{o.title}</h1>
                <p className="mt-0.5 text-muted">{o.organizationName}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <FieldChip domainId={field.domain} inferred={field.basis === "skills"} />
                  {o.isSample && <SampleBadge />}
                </div>
              </div>
            </div>
            {o.isSample && (
              <p className="mt-4 flex gap-2 rounded-lg bg-peach-soft px-4 py-3 text-sm text-orange-deep">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" /> This is a sample listing for demonstration. The organization is fictional and applications are not sent to any employer.
              </p>
            )}

            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl border border-line px-3 py-2.5 text-center">
                  <dt className="text-xs text-muted">{s.label}</dt>
                  <dd className={`mt-0.5 font-semibold ${s.className ?? "text-navy"}`}>{s.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6">
              <OpportunityStory
                tile={tone.tile}
                deep={tone.deep}
                slides={[
                  { id: "overview", label: "Overview", content: overview },
                  ...(roleSlide ? [{ id: "role", label: "The role", content: roleSlide }] : []),
                  ...(needSlide ? [{ id: "need", label: "You'll need", content: needSlide }] : []),
                  { id: "fit", label: "Why it fits", content: whyItFits },
                  { id: "company", label: "Company", content: company },
                ]}
              />
              {/* The employer's full text, for anyone who wants every detail. */}
              <details className="group mt-4 rounded-2xl border border-line bg-surface">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-5 text-[15px] font-semibold text-navy focus-visible:outline-2 focus-visible:outline-purple [&::-webkit-details-marker]:hidden">
                  Read the full description
                  <span aria-hidden className="text-muted transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <div className="space-y-6 border-t border-line px-5 py-5">
                  {splitSections(o.description, 99).map((s) => (
                    <section key={s.title}>
                      <h3 className="text-lg font-semibold text-navy">{s.title}</h3>
                      <div className="mt-2"><SectionBody lines={s.lines} dot={tone.ink} /></div>
                    </section>
                  ))}
                </div>
              </details>
            </div>
          </div>

          <div className="sticky bottom-0 mt-auto flex items-center gap-3 rounded-b-3xl border-t border-line bg-surface/95 px-5 py-4 backdrop-blur sm:px-7">
            {deadline.closed ? (
              <p className="flex-1 text-sm font-semibold text-danger">Applications are closed.</p>
            ) : o.applicationMethod === "external" && !isWebUrl(o.externalUrl) ? (
              <p className="flex-1 text-sm text-muted">The apply link for this listing isn&apos;t available.</p>
            ) : o.applicationMethod === "external" ? (
              <a href={o.externalUrl!} target="_blank" rel="noopener noreferrer nofollow" className={buttonClass("primary", "lg", "min-w-0 flex-1 rounded-full whitespace-nowrap")} title="You'll leave Avsar. We can't track applications made on other sites.">
                <span className="sm:hidden">Apply now</span><span className="hidden sm:inline">Apply on {o.organizationName}&apos;s site</span> <ExternalLink aria-hidden className="size-4 shrink-0" />
              </a>
            ) : session ? (
              <Link href={`/app/apply/${o.slug}`} className={buttonClass("primary", "lg", "flex-1 rounded-full")}>Apply on Avsar</Link>
            ) : (
              <Link href={signIn(`/app/apply/${o.slug}`)} className={buttonClass("primary", "lg", "flex-1 rounded-full")}>Continue with AI Tathastu to apply</Link>
            )}
            {session ? <SaveButton opportunityId={o.id} saved={saved} path={`/opportunities/${o.slug}`} /> : <Link href={signIn(`/opportunities/${o.slug}?intent=save`)} className={buttonClass("secondary", "md", "shrink-0 rounded-full")}>Save</Link>}
            {savedNow && <p role="status" className="w-full text-center text-sm text-success">Saved to your list.</p>}
          </div>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {match ? <MatchSummary match={match} matchedSkills={matchedSkills} /> : session ? null : <SignInToSeeFit slug={o.slug} />}
          {eligibility.status !== "eligible" && <EligibilityPanel result={eligibility} />}
        </aside>
      </div>

      {similar.length > 0 && (
        <section aria-labelledby="similar" className="mt-14">
          <h2 id="similar" className="font-serif text-2xl text-navy">Similar opportunities</h2>
          <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-5">
            {similar.map((s, n) => <li key={s.id}><OpportunityTile o={s} index={n} /></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
