import "server-only";

import type { Db } from "../db/client";
import { DEFAULT_WEIGHTS, matchOpportunity, type MatchResult } from "../domain/matching";
import type { CandidateFacts } from "../domain/types";
import { toFacts, type OpportunityFull } from "./opportunities";
import { loadProfile, toCandidateFacts } from "./profiles";

/** The signed-in candidate's facts for matching, or null (signed out / no profile). */
export async function candidateFactsFor(db: Db, profileId: string | null): Promise<CandidateFacts | null> {
  if (!profileId) return null;
  const p = await loadProfile(db, profileId);
  return p ? toCandidateFacts(p) : null;
}

/** Match results keyed by opportunity id. Matching is advisory and never hides a listing. */
export function matchAll(facts: CandidateFacts | null, items: OpportunityFull[]): Map<string, MatchResult> {
  const out = new Map<string, MatchResult>();
  if (!facts) return out;
  for (const o of items) out.set(o.id, matchOpportunity(facts, toFacts(o), DEFAULT_WEIGHTS));
  return out;
}
