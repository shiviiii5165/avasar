import Link from "next/link";
import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";

import { Badge, buttonClass } from "@/components/ui";
import { ELIGIBILITY_LABEL, type EligibilityResult } from "@/server/domain/eligibility";
import type { MatchResult } from "@/server/domain/matching";
import { StatusPill } from "@/components/career/status-pill";
import { cardMatch, tierLabel } from "@/components/opportunity/opportunity-card";
import { orgTone } from "@/components/opportunity/brand";
import type { SkillState } from "@/server/intelligence/evidence";

const IMPORTANCE_LABEL = { required: "Required by the employer", preferred: "Nice to have (employer)", mentioned: "Mentioned in the description (worked out by Avsar)" } as const;
const KIND_LABEL = { observed: "From your profile", inferred: "Worked out by Avsar", unknown: "Not known yet" } as const;
const STRONG: ReadonlySet<string> = new Set(["verified", "demonstrated"]);

/** Per-requirement breakdown: who stated the requirement, which of the student's skills covers it, and how well evidenced. */
function SkillBreakdown({ verdicts }: { verdicts: NonNullable<MatchResult["skillVerdicts"]> }) {
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold text-navy">Skills, one by one</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {verdicts.map((v) => {
          const s = v.supportedBy;
          return (
            <li key={`${v.importance}:${v.requirement}`} className="rounded-lg border border-line p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-navy">{v.requirement}</span>
                <StatusPill state={!s ? "not_shown" : s.relation === "related" ? "related" : (s.state as SkillState)} />
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {IMPORTANCE_LABEL[v.importance]}
                {s && (s.relation === "related"
                  ? ` · your ${s.name} is a related skill, so it counts only partly`
                  : s.relation === "specialization"
                    ? ` · covered by your ${s.name} (a specialization)`
                    : "")}
                {s && s.relation !== "related" && !STRONG.has(s.state) && " · on your profile, but not yet shown in a project, job or assessment"}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const STATUS_TONE = { eligible: "success", ineligible: "danger", potentially_eligible: "warning", insufficient_information: "neutral", unavailable: "neutral" } as const;
const FACTOR_LABEL = { skills: "Skills", education: "Education", experience: "Experience", location: "Location", workMode: "Work mode", preferences: "Preferences", skillFit: "Skill fit", roleAlignment: "Target role", personalFit: "Your preferences" } as const;

export function EligibilityPanel({ result }: { result: EligibilityResult }) {
  return (
    <section aria-labelledby="elig-title" className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 id="elig-title" className="text-base font-semibold text-navy">Eligibility</h2>
        <Badge tone={STATUS_TONE[result.status]}>{ELIGIBILITY_LABEL[result.status]}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">Mandatory requirements only. Missing details are never counted against you.</p>
      {result.checks.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {result.checks.map((c) => (
            <li key={c.key} className="flex gap-2 text-sm">
              {c.outcome === "pass" ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : c.outcome === "fail" ? <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" /> : <CircleHelp aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />}
              <span><span className="font-medium text-navy">{c.label}:</span> <span className="text-muted">{c.detail}</span><span className="sr-only"> ({c.outcome === "pass" ? "met" : c.outcome === "fail" ? "not met" : "unknown"})</span></span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">This listing states no mandatory requirements.</p>
      )}
      {result.missingInformation.length > 0 && (
        <p className="mt-3 text-sm"><Link href="/app/profile" className="font-semibold text-purple underline-offset-4 hover:underline">{result.missingInformation.join(" · ")}</Link></p>
      )}
    </section>
  );
}

export function MatchPanel({ match }: { match: MatchResult }) {
  return (
    <section aria-labelledby="match-title" className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 id="match-title" className="text-base font-semibold text-navy">Why this matches you</h2>
        {match.score !== null && match.tier && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tierLabel(match).tone}`} title={tierLabel(match).hint}>{tierLabel(match).text}</span>}
      </div>
      <p className="mt-1 text-xs text-muted">
        A relative guide from your profile, not a prediction. Based on {Math.round(match.completeness * 100)}% of the factors · evidence {match.evidence === "none" ? "not available" : match.evidence}.
      </p>
      {match.explanations && match.explanations.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {match.explanations.slice(0, 6).map((e) => (
            <li key={e.text} className="flex gap-2">
              {e.kind === "observed" ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleHelp aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />}
              <span><span className="text-xs font-semibold text-muted">{KIND_LABEL[e.kind]}:</span> {e.text}</span>
            </li>
          ))}
        </ul>
      ) : match.reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {match.reasons.map((r) => (
            <li key={r} className="flex gap-2"><CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />{r}</li>
          ))}
        </ul>
      )}
      {(match.missingRequiredSkills.length > 0 || match.missingPreferredSkills.length > 0) && (
        <div className="mt-3 text-sm">
          {match.missingRequiredSkills.length > 0 && <p><span className="font-medium text-navy">Required skills you haven&apos;t listed:</span> <span className="text-muted">{match.missingRequiredSkills.join(", ")}</span></p>}
          {match.missingPreferredSkills.length > 0 && <p className="mt-1"><span className="font-medium text-navy">Nice to have:</span> <span className="text-muted">{match.missingPreferredSkills.join(", ")}</span></p>}
        </div>
      )}
      {match.skillVerdicts && match.skillVerdicts.length > 0 && <SkillBreakdown verdicts={match.skillVerdicts} />}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-navy">How this is worked out{match.version ? ` (${match.version})` : ""}</summary>
        <p className="mt-1 text-xs text-muted">First, relevance to your career goal: your field, a nearby field, or a different one (one shared general skill never makes a different field relevant). Then, within that, a relative order from skill fit (50%), target role and field (25%) and your preferences (25%). Parts that can&apos;t be assessed are left out, not counted as zero. Neither is a chance of being hired.</p>
        <ul className="mt-2 space-y-1 text-muted">
          {match.factors.map((f) => (
            <li key={f.factor} className="flex justify-between gap-2">
              <span>{FACTOR_LABEL[f.factor]}: {f.note}</span>
              <span className="shrink-0 font-medium text-navy">{f.assessed ? `${Math.round(f.value * 100)}%` : "not assessed"}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** The sidebar summary: up to three plain reasons and the listing's skills already on the student's profile. */
export function MatchSummary({ match, matchedSkills }: { match: MatchResult; matchedSkills: string[] }) {
  const fit = match.score !== null && match.tier ? tierLabel(match) : null;
  const reasons = cardMatch(match).reasons ?? [];
  return (
    <section aria-labelledby="why-title" className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 id="why-title" className="font-serif text-xl text-navy">Why this matches you</h2>
        {fit && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${fit.tone}`} title={fit.hint}>{fit.text}</span>}
      </div>
      {reasons.length > 0 ? (
        <ul className="mt-3 space-y-2.5 text-sm">
          {reasons.map((r) => (
            <li key={r} className="flex gap-2"><CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 fill-success text-white" /><span className="text-navy">{r}</span></li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Your profile has few details to compare with this listing yet.</p>
      )}
      {matchedSkills.length > 0 && (
        <>
          <p className="mt-4 border-t border-line pt-3 text-xs font-semibold uppercase tracking-wide text-muted">Your skills it uses</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {matchedSkills.map((s) => {
              const t = orgTone(s);
              return <li key={s} className="rounded-full px-3 py-1 text-sm font-medium" style={{ backgroundColor: t.tile, color: t.ink }}>{s}</li>;
            })}
          </ul>
        </>
      )}
    </section>
  );
}

export function SignInToSeeFit({ slug }: { slug: string }) {
  return (
    <section className="rounded-xl border border-dashed border-line bg-surface p-5 text-sm">
      <h2 className="text-base font-semibold text-navy">See if you qualify</h2>
      <p className="mt-1 text-muted">Sign in to check eligibility, see why this matches you and apply. Browsing stays free and open.</p>
      <Link href={`/sign-in?returnTo=/opportunities/${slug}`} className={buttonClass("primary", "sm", "mt-3")}>Continue with AI Tathastu</Link>
    </section>
  );
}
