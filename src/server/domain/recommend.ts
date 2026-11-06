/**
 * "Recommended for You" and personalized ordering. Pure and deterministic.
 *
 * Eligibility and relevance stay separate:
 *  - A listing that FAILS a mandatory requirement (ineligible) or is closed (unavailable) is never
 *    recommended, whatever its match score.
 *  - Unknown eligibility (the profile doesn't say) is not a failure and is not penalized.
 *  - Order is match score (higher first), unscored last, then earlier deadline, then id, so the result is
 *    stable for the same inputs.
 */
import { matchOpportunity, type MatchResult } from "./matching";
import type { CandidateFacts, OpportunityFacts } from "./types";

export interface Candidate<T> { item: T; id: string; facts: OpportunityFacts }
export interface Ranked<T> { item: T; id: string; match: MatchResult }

/** Below this average share of assessable factors, picks are "broadly relevant", and the UI says so. */
export const LIMITED_DATA_THRESHOLD = 0.4;

const excluded = (m: MatchResult) => m.eligibility.status === "ineligible" || m.eligibility.status === "unavailable";

function compare<T>(a: Ranked<T> & { deadline: Date | null }, b: Ranked<T> & { deadline: Date | null }) {
  const s = (b.match.score ?? -1) - (a.match.score ?? -1);
  if (s) return s;
  const da = a.deadline?.getTime() ?? Infinity;
  const db = b.deadline?.getTime() ?? Infinity;
  if (da !== db) return da - db;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function score<T>(candidate: CandidateFacts, items: Candidate<T>[], now: Date) {
  return items.map((c) => ({ item: c.item, id: c.id, deadline: c.facts.deadline, match: matchOpportunity(candidate, c.facts, undefined, now) }));
}

export function recommend<T>(candidate: CandidateFacts, items: Candidate<T>[], opts: { limit?: number; exclude?: Set<string>; now?: Date } = {}): { picks: Ranked<T>[]; limited: boolean } {
  const now = opts.now ?? new Date();
  const scored = score(candidate, items, now);
  const closed = (m: MatchResult) => m.eligibility.status === "unavailable" || m.eligibility.checks.some((c) => c.key === "deadline" && c.outcome === "fail");
  const open = scored.filter((r) => !closed(r.match));
  const coverage = open.length ? open.reduce((s, r) => s + r.match.completeness, 0) / open.length : 0;
  const picks = scored
    .filter((r) => !excluded(r.match) && !opts.exclude?.has(r.id))
    .sort(compare)
    .slice(0, opts.limit ?? 3)
    .map(({ item, id, match }) => ({ item, id, match }));
  return { picks, limited: coverage < LIMITED_DATA_THRESHOLD };
}

/** Full personalized order for browsing: everything stays visible; only failed or closed listings sink. */
export function rankForBrowse<T>(candidate: CandidateFacts, items: Candidate<T>[], now = new Date()): Ranked<T>[] {
  return score(candidate, items, now)
    .sort((a, b) => Number(excluded(a.match)) - Number(excluded(b.match)) || compare(a, b))
    .map(({ item, id, match }) => ({ item, id, match }));
}
