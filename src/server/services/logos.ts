import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { Db } from "@/server/db/client";
import { opportunities, organizations } from "@/server/db/schema";
import { publicVisibility } from "@/server/services/opportunities";

/**
 * Company logos for opportunity tiles. Listings store no logo file, so the company's domain is worked out
 * (organization record → apply link → the exact company name as a domain) and its icon fetched SERVER-SIDE from one
 * fixed host. Browsers only ever load /api/logo from Avsar itself: no third party sees who views what, and the CSP
 * stays 'self'.
 *
 * Abuse limits: only names of published listings are resolved (no arbitrary lookups or fetch amplification), the
 * outbound host is fixed (the domain is a validated query value, so no SSRF), responses must be small raster images
 * (never SVG), and results, including misses, are cached.
 */

const ICON_HOST = "https://www.google.com/s2/favicons";
const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const RASTER = /^image\/(png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon)$/;
const MAX_BYTES = 200_000;
const HIT_TTL = 7 * 24 * 3600_000;
const MISS_TTL = 24 * 3600_000;
const MAX_ENTRIES = 2000;

/** Job boards and applicant-tracking hosts: an apply link there says nothing about the company's own domain. */
const NOT_COMPANY = /(^|\.)(greenhouse\.io|lever\.co|myworkdayjobs\.com|workday\.com|linkedin\.com|indeed\.com|naukri\.com|internshala\.com|unstop\.com|wellfound\.com|angel\.co|smartrecruiters\.com|ashbyhq\.com|bamboohr\.com|zoho\.(com|in)|freshteam\.com|keka\.com|darwinbox\.(com|in)|instahyre\.com|cutshort\.io|foundit\.in|shine\.com|hirist\.(com|tech)|glassdoor\.(com|co\.in)|apna\.co|workable\.com|breezy\.hr|recruitee\.com|jobvite\.com|icims\.com|taleo\.net|successfactors\.(com|eu)|notion\.site|typeform\.com|github\.com|google\.com|forms\.gle|avsar\.aitathastu\.com|aitathastu\.com)$/;
const SUFFIXES = /\b(private|pvt|limited|ltd|llp|inc|incorporated|corp|corporation|co|company|technologies|technology|tech|solutions|services|labs|india|global|group)\b\.?/g;

export type Logo = { bytes: Uint8Array; type: string } | null;
const cache = new Map<string, { expires: number; logo: Promise<Logo> }>();

export function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

/** Registrable part of a host ("careers.rubrik.com" → "rubrik.com", "x.tcs.co.in" → "tcs.co.in"). */
function registrable(host: string): string {
  const parts = host.replace(/^www\./, "").split(".");
  const twoLevel = parts.length > 2 && /^(co|com|org|net|ac|gov)$/.test(parts.at(-2)!) && parts.at(-1)!.length === 2;
  return parts.slice(twoLevel ? -3 : -2).join(".");
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.toLowerCase();
    return DOMAIN_RE.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** Candidate domains in order of trust. Guesses use the exact compacted name only, so a wrong company is unlikely. */
export function candidateDomains(name: string, known: (string | null | undefined)[], links: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const add = (d: string | null) => { if (d && DOMAIN_RE.test(d) && !NOT_COMPANY.test(d) && !out.includes(d)) out.push(d); };
  for (const k of known) { const h = hostOf(k); if (h) add(registrable(h)); }
  const base = normalizeName(name);
  const full = base.replace(/[^a-z0-9]/g, "");
  const core = base.replace(SUFFIXES, " ").replace(/[^a-z0-9]/g, "");
  for (const l of links) {
    const h = hostOf(l);
    if (!h || NOT_COMPANY.test(h)) continue;
    const label = registrable(h).split(".")[0];
    // The link's domain must look like the company's name, or it could be an agency or aggregator.
    if (label.length >= 3 && (full.startsWith(label) || label.startsWith(core.slice(0, Math.max(4, Math.min(core.length, 6)))))) add(registrable(h));
  }
  if (core.length >= 3) for (const tld of ["com", "in", "co.in", "ai", "io", "co"]) add(`${core}.${tld}`);
  if (full !== core && full.length >= 3) add(`${full}.com`);
  return out.slice(0, 8);
}

async function fetchIcon(domain: string): Promise<Logo> {
  try {
    const res = await fetch(`${ICON_HOST}?domain=${encodeURIComponent(domain)}&sz=128`, { signal: AbortSignal.timeout(3000), redirect: "follow", cache: "no-store" });
    if (res.status !== 200) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!RASTER.test(type)) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Tiny responses are generic placeholder globes, not a real logo.
    if (bytes.byteLength < 300 || bytes.byteLength > MAX_BYTES) return null;
    return { bytes, type };
  } catch {
    return null;
  }
}

async function resolve(db: Db, key: string): Promise<Logo> {
  // Only organizations that have a published listing can be looked up.
  const rows = await db
    .select({ name: opportunities.organizationName, externalUrl: opportunities.externalUrl, sourceUrl: opportunities.sourceUrl, domain: organizations.domain, website: organizations.website })
    .from(opportunities)
    .leftJoin(organizations, eq(organizations.id, opportunities.orgId))
    .where(and(publicVisibility(), sql`lower(trim(${opportunities.organizationName})) = ${key}`))
    .limit(5);
  if (rows.length === 0) return null;
  const domains = candidateDomains(rows[0].name, rows.flatMap((r) => [r.domain, r.website]), rows.flatMap((r) => [r.externalUrl, r.sourceUrl]));
  for (const d of domains) {
    const logo = await fetchIcon(d);
    if (logo) return logo;
  }
  return null;
}

export function logoFor(db: Db, name: string): Promise<Logo> {
  const key = normalizeName(name);
  if (key.length < 2) return Promise.resolve(null);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expires) return hit.logo;
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  const entry = { expires: Date.now() + MISS_TTL, logo: resolve(db, key).catch(() => null) };
  // A found logo is kept a week; a miss is retried after a day. Concurrent requests share the one lookup.
  void entry.logo.then((l) => { if (l) entry.expires = Date.now() + HIT_TTL; });
  cache.set(key, entry);
  return entry.logo;
}
