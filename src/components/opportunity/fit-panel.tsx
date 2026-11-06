import Link from "next/link";
import { CheckCircle2, CircleHelp, Lightbulb, XCircle } from "lucide-react";

import { Badge, buttonClass } from "@/components/ui";
import { ELIGIBILITY_LABEL, type EligibilityResult } from "@/server/domain/eligibility";
import type { MatchResult } from "@/server/domain/matching";

const STATUS_TONE = { eligible: "success", ineligible: "danger", potentially_eligible: "warning", insufficient_information: "neutral", unavailable: "neutral" } as const;
const FACTOR_LABEL = { skills: "Skills", education: "Education", experience: "Experience", location: "Location", workMode: "Work mode", preferences: "Preferences" } as const;

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
        {match.score !== null && <span className="text-sm font-bold text-purple">{match.score}% match</span>}
      </div>
      <p className="mt-1 text-xs text-muted">
        A relative guide from your profile, not a prediction. Based on {Math.round(match.completeness * 100)}% of the factors · evidence {match.evidence === "none" ? "not available" : match.evidence}.
      </p>
      {match.reasons.length > 0 && (
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
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-navy">How each factor scored</summary>
        <ul className="mt-2 space-y-1 text-muted">
          {match.factors.map((f) => (
            <li key={f.factor} className="flex justify-between gap-2">
              <span>{FACTOR_LABEL[f.factor]}: {f.note}</span>
              <span className="shrink-0 font-medium text-navy">{f.assessed ? `${Math.round(f.value * 100)}%` : "not assessed"}</span>
            </li>
          ))}
        </ul>
      </details>
      {match.nextActions.length > 0 && (
        <div className="mt-4 rounded-lg bg-purple-soft/60 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-purple"><Lightbulb aria-hidden className="size-4" /> Next useful steps</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-navy-soft">
            {match.nextActions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
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
