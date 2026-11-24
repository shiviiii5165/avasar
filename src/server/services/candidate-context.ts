import "server-only";

import type { Db } from "../db/client";
import type { MatchResult } from "../domain/matching";
import type { Matcher } from "../intelligence/canonical-match";
import { matcherForProfile } from "./career";
import { toFacts, type OpportunityFull } from "./opportunities";
import { loadProfile } from "./profiles";

/** The signed-in candidate's canonical matcher, or null (signed out / no profile). */
export async function matcherFor(db: Db, profileId: string | null): Promise<Matcher | null> {
  if (!profileId) return null;
  return matcherForProfile(db, await loadProfile(db, profileId));
}

/** Match results keyed by opportunity id. Matching is advisory and never hides a listing. */
export function matchAll(match: Matcher | null, items: OpportunityFull[]): Map<string, MatchResult> {
  const out = new Map<string, MatchResult>();
  if (!match) return out;
  for (const o of items) if (!out.has(o.id)) out.set(o.id, match(toFacts(o)));
  return out;
}
