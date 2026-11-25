/**
 * Duplicate detection across sources, from several independent signals. Pure.
 *
 * Two records are the SAME listing when any strong signal holds:
 *   - same source and source record id
 *   - same normalized original/application URL
 *   - same content fingerprint (title, employer, locations, description)
 * or when ALL of the weak signals hold together:
 *   - same normalized employer AND same normalized title AND compatible locations
 *   - AND (description similarity ≥ DESCRIPTION_THRESHOLD, or the same published deadline)
 *
 * Similar titles alone never merge listings: "Software Engineer" at two employers, or at one employer in two
 * cities with different descriptions, stay separate.
 */
import { normalizeEmployer, normalizeLocation, normalizeTitle, normalizeUrl } from "./normalize";

export const DESCRIPTION_THRESHOLD = 0.6;

export interface Comparable {
  sourceId?: string | null;
  sourceRecordId?: string | null;
  urls: (string | null | undefined)[];
  fingerprint: string | null;
  title: string;
  organization: string;
  locations: string[];
  workMode: string;
  description: string;
  deadline: Date | null;
}

export interface DuplicateDecision {
  duplicate: boolean;
  matchedBy: "source_record" | "url" | "fingerprint" | "multi_signal" | null;
  signals: { sameEmployer: boolean; sameTitle: boolean; locationsCompatible: boolean; descriptionSimilarity: number; sameDeadline: boolean };
}

function shingles(text: string, n = 3): Set<string> {
  const w = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  if (!out.size && w.length) out.add(w.join(" "));
  return out;
}

export function jaccard(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function compareListings(a: Comparable, b: Comparable): DuplicateDecision {
  const la = a.locations.map(normalizeLocation);
  const lb = b.locations.map(normalizeLocation);
  const signals = {
    sameEmployer: normalizeEmployer(a.organization) !== "" && normalizeEmployer(a.organization) === normalizeEmployer(b.organization),
    sameTitle: normalizeTitle(a.title) === normalizeTitle(b.title),
    locationsCompatible: (a.workMode === "remote" && b.workMode === "remote") || (!la.length && !lb.length) || la.some((l) => lb.includes(l)),
    descriptionSimilarity: Math.round(jaccard(a.description, b.description) * 100) / 100,
    sameDeadline: a.deadline !== null && b.deadline !== null && a.deadline.toISOString().slice(0, 10) === b.deadline.toISOString().slice(0, 10),
  };
  if (a.sourceId && a.sourceId === b.sourceId && a.sourceRecordId && a.sourceRecordId === b.sourceRecordId) return { duplicate: true, matchedBy: "source_record", signals };
  const ua = new Set(a.urls.map(normalizeUrl).filter(Boolean));
  if (b.urls.map(normalizeUrl).some((u) => u && ua.has(u))) return { duplicate: true, matchedBy: "url", signals };
  if (a.fingerprint && a.fingerprint === b.fingerprint) return { duplicate: true, matchedBy: "fingerprint", signals };
  const multi = signals.sameEmployer && signals.sameTitle && signals.locationsCompatible && (signals.descriptionSimilarity >= DESCRIPTION_THRESHOLD || signals.sameDeadline);
  return { duplicate: multi, matchedBy: multi ? "multi_signal" : null, signals };
}

/**
 * Keeps the first of each set of duplicates in an already-ordered list, up to `limit` items. For display only:
 * nothing is merged or deleted. Stricter than ingestion on one signal: a shared URL alone (an employer's generic
 * careers page) does not make two differently titled roles the same listing.
 */
export function distinctListings<T>(ordered: T[], comparable: (x: T) => Comparable, limit = Infinity): T[] {
  const kept: { item: T; c: Comparable }[] = [];
  for (const item of ordered) {
    if (kept.length >= limit) break;
    const c = comparable(item);
    const dup = kept.some((k) => {
      const d = compareListings(k.c, c);
      return d.duplicate && (d.matchedBy !== "url" || d.signals.sameTitle);
    });
    if (!dup) kept.push({ item, c });
  }
  return kept.map((k) => k.item);
}
