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
 * The title that identifies a role across feeds: normalized (normalize.ts normalizeTitle) with a trailing location
 * or work-mode qualifier removed, so "Senior AI Engineer (Pune)", "Senior AI Engineer - Bengaluru" and
 * "Sr. AI Engineer – Remote, India" all identify the same role. Only known place/work-mode words are removed;
 * anything else in the title ("- Ads", "- Payments", "II") is part of the role and kept.
 */
const PLACE_WORDS = new Set([
  "india", "remote", "hybrid", "onsite", "on site", "work from home", "wfh", "anywhere",
  "bengaluru", "bangalore", "mumbai", "navi mumbai", "pune", "hyderabad", "chennai", "delhi", "new delhi", "ncr", "delhi ncr", "gurugram", "gurgaon",
  "noida", "kolkata", "ahmedabad", "jaipur", "chandigarh", "kochi", "cochin", "coimbatore", "indore", "lucknow", "bhubaneswar", "thiruvananthapuram",
  "trivandrum", "mysuru", "mysore", "nagpur", "vadodara", "surat", "visakhapatnam", "goa", "mohali", "bhopal", "patna", "guwahati", "dehradun",
]);
export function roleTitle(title: string): string {
  let t = title.trim();
  for (let guard = 0; guard < 3; guard++) {
    const m = t.match(/^(.*\S)\s*(?:\(([^()]*)\)|[-–—|,:]\s*([^-–—|,:()]+))$/);
    if (!m) break;
    const tail = (m[2] ?? m[3] ?? "").toLowerCase().replace(/[^a-z ,/]+/g, " ").split(/[,/]| or | and /).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!tail.length || !tail.every((w) => PLACE_WORDS.has(w))) break;
    t = m[1];
  }
  return normalizeTitle(t);
}

/** A description too short to tell two postings apart (empty, or a one-line teaser). */
const MIN_DESCRIPTION_WORDS = 12;
const informative = (d: string) => d.trim().split(/\s+/).filter(Boolean).length >= MIN_DESCRIPTION_WORDS;

export interface OpeningInput extends Comparable { employmentType?: string | null }
export type OpeningMatch = "source_record" | "url" | "fingerprint" | "same_role" | null;

/**
 * Are two records the SAME opening? Used by ingestion (before creating a listing) and by every page (canonicalize),
 * so both apply one rule:
 *   strong   same source record · same content fingerprint · same application URL (tracking parameters removed) AND
 *            the same role title (a shared careers-page URL alone never merges two roles)
 *   same_role  same employer AND same role title (roleTitle) AND compatible job type AND
 *            (description similarity ≥ DESCRIPTION_THRESHOLD, or the same deadline, or neither description says
 *            enough to tell them apart). Locations are NOT compared: feeds publish one role once per city.
 * Different role titles, different job types, or the same title with clearly different descriptions stay separate.
 */
export function sameOpening(a: OpeningInput, b: OpeningInput): OpeningMatch {
  const ta = roleTitle(a.title), tb = roleTitle(b.title);
  if (a.sourceId && a.sourceId === b.sourceId && a.sourceRecordId && a.sourceRecordId === b.sourceRecordId) return "source_record";
  const ua = new Set(a.urls.map(normalizeUrl).filter(Boolean));
  if (ta === tb && b.urls.map(normalizeUrl).some((u) => u && ua.has(u))) return "url";
  if (a.fingerprint && a.fingerprint === b.fingerprint) return "fingerprint";
  const employer = normalizeEmployer(a.organization);
  if (!employer || employer !== normalizeEmployer(b.organization) || !ta || ta !== tb) return null;
  if (a.employmentType && b.employmentType && a.employmentType !== b.employmentType) return null;
  const sameDeadline = a.deadline !== null && b.deadline !== null && a.deadline.toISOString().slice(0, 10) === b.deadline.toISOString().slice(0, 10);
  const uninformative = !informative(a.description) && !informative(b.description);
  return sameDeadline || uninformative || jaccard(a.description, b.description) >= DESCRIPTION_THRESHOLD ? "same_role" : null;
}

/**
 * Canonical opportunities: groups records that are the SAME opening (sameOpening) and keeps one representative per
 * group. Output keeps input order (position of each group's first record). The representative is the most
 * trustworthy record (employer-verified, then source-checked, then posted on Avsar, then input order); its
 * `locations` are the union of the group's, and `duplicateIds` lists the other records' ids so saves and dismissals
 * made on any copy still apply. Pure; strong signals are hashed, the role rule is checked only within one
 * employer + role-title bucket.
 */
export interface CanonicalInput extends OpeningInput { id: string; verification?: string | null }
export function canonicalize<T extends { id: string; locations: string[] }>(items: T[], comparable: (x: T) => CanonicalInput): (T & { duplicateIds: string[] })[] {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const cs = items.map(comparable);
  const strong = new Map<string, number>();
  const buckets = new Map<string, number[]>();
  cs.forEach((c, i) => {
    const title = roleTitle(c.title);
    const keys = [
      c.sourceId && c.sourceRecordId ? `rec:${c.sourceId}|${c.sourceRecordId}` : null,
      c.fingerprint ? `fp:${c.fingerprint}` : null,
      ...c.urls.map(normalizeUrl).filter(Boolean).map((u) => `url:${u}|${title}`),
    ].filter((k): k is string => Boolean(k));
    for (const k of keys) {
      const j = strong.get(k);
      if (j === undefined) strong.set(k, i);
      else union(i, j);
    }
    const employer = normalizeEmployer(c.organization);
    if (employer && title) {
      const b = `${employer}|${title}`;
      buckets.set(b, [...(buckets.get(b) ?? []), i]);
    }
  });
  for (const list of buckets.values())
    for (let x = 0; x < list.length; x++)
      for (let y = x + 1; y < list.length; y++) {
        if (find(list[x]) === find(list[y])) continue;
        if (sameOpening(cs[list[x]], cs[list[y]])) union(list[x], list[y]);
      }

  const trust = (i: number) => (cs[i].verification === "org_verified" ? 4 : cs[i].verification === "source_verified" ? 2 : 0) + (cs[i].sourceId ? 0 : 1);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) groups.set(find(i), [...(groups.get(find(i)) ?? []), i]);
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, members]) => {
      const rep = [...members].sort((a, b) => trust(b) - trust(a) || a - b)[0];
      const locations = [...new Set(members.flatMap((i) => items[i].locations))];
      return { ...items[rep], locations, duplicateIds: members.filter((i) => i !== rep).map((i) => items[i].id) };
    });
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
