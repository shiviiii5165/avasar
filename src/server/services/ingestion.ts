import "server-only";

import { createHash } from "node:crypto";

import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { audit } from "../audit";
import type { Db } from "../db/client";
import { ingestionRuns, opportunities, opportunitySkills, opportunitySourceRefs, opportunitySources, opportunityVersions } from "../db/schema";
import { ADAPTERS, adapterFor, boundGetter, missingConfig, type CollectResult, type SourceAdapter } from "../ingestion/adapters";
import { boardPageUrl, KNOWN_BOARDS } from "../ingestion/ats";
import { roleTitle, sameOpening } from "../ingestion/dedupe";
import { normalizeListing, normalizeTitle, type NormalizedListing } from "../ingestion/normalize";
import type { Resolver, Transport } from "../ingestion/safe-fetch";
import { registry } from "../intelligence/registry";
import { log } from "../log";
import { setOpportunityVerification } from "./verification";

/**
 * Ingestion pipeline: permission gate → collect (adapter) → validate & normalize → deduplicate → create or update
 * → mark missing/stale → record the run. Nothing is ever published by ingestion: new listings wait in review.
 *
 * Stale/expiry policy (docs/INGESTION.md):
 *  - Only a SUCCESSFUL, COMPLETE run can mark records missing; a failed run changes no listing.
 *  - A listing is stale when every source that listed it has stopped listing it (staleSince).
 *  - A published listing stale for STALE_EXPIRE_DAYS, or past its deadline, becomes "expired". Never deleted;
 *    history (versions, source refs, verification events) is kept.
 */
export const STALE_EXPIRE_DAYS = 14;
const DAY = 86_400_000;

export interface RunDeps { transport?: Transport; resolver?: Resolver; sleep?: (ms: number) => Promise<void>; collect?: (a: SourceAdapter) => Promise<CollectResult> }

/** Adds a source row for each built-in adapter (unreviewed, inactive). Idempotent; never changes an existing row. */
export async function ensureSourceRegistry(db: Db) {
  for (const a of ADAPTERS.filter((x) => x.family !== "employer_careers" && x.accessMethod !== "employer_job_board_api")) {
    await db
      .insert(opportunitySources)
      .values({ name: a.name, kind: a.accessMethod === "link_only" ? "manual" : "feed", url: a.homepage, termsNote: a.termsNote, active: false, adapterKey: a.family, authority: a.authority, permissionStatus: "unreviewed" })
      .onConflictDoNothing();
  }
  // Employer job boards verified to carry openings in India: unreviewed and off until an admin approves each.
  for (const b of KNOWN_BOARDS) {
    const a = adapterFor(b.family)!;
    await db
      .insert(opportunitySources)
      .values({ name: b.employer, kind: "api", url: boardPageUrl(b.family, b.id), termsNote: a.termsNote, active: false, adapterKey: `${b.family}:${b.id}`, authority: "employer", permissionStatus: "unreviewed" })
      .onConflictDoNothing();
  }
}

export type SourceHealth = "disabled" | "awaiting_permission" | "display_only" | "not_configured" | "never_run" | "healthy" | "degraded" | "failing";

export function sourceHealth(s: { active: boolean; permissionStatus: string; adapterKey: string | null; url: string | null; lastSuccessAt: Date | null; lastRunAt: Date | null; consecutiveFailures: number }, env: Record<string, string | undefined> = process.env): SourceHealth {
  if (s.permissionStatus === "disabled") return "disabled";
  if (s.permissionStatus === "unreviewed") return "awaiting_permission";
  if (s.permissionStatus === "approved_display") return "display_only";
  const a = adapterFor(s.adapterKey);
  if (!a || !a.collect || missingConfig(a, env, s.url).length) return "not_configured";
  if (!s.active) return "disabled";
  if (!s.lastRunAt) return "never_run";
  if (s.consecutiveFailures >= 3) return "failing";
  if (s.consecutiveFailures > 0) return "degraded";
  return "healthy";
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const safeError = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/https?:\/\/\S+/g, "[url]").slice(0, 300);

type Counts = { collected: number; created: number; updated: number; unchanged: number; duplicates: number; rejected: number; markedStale: number };

/** Runs one source. Returns the run row. Never throws for source problems (they are recorded on the run). */
export async function runIngestion(db: Db, sourceId: string, opts: { trigger: "schedule" | "manual"; actorId?: string | null; env?: Record<string, string | undefined>; now?: Date; deps?: RunDeps; /** Wall-clock ms after which record processing stops cleanly (serverless time limits). */ deadlineAt?: number } = { trigger: "schedule" }) {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const [source] = await db.select().from(opportunitySources).where(eq(opportunitySources.id, sourceId));
  if (!source) throw new Error("SOURCE_NOT_FOUND");
  const adapter = adapterFor(source.adapterKey);
  const [run] = await db.insert(ingestionRuns).values({ sourceId, trigger: opts.trigger, startedAt: now }).returning();
  const finish = async (status: "succeeded" | "partial" | "failed" | "skipped", counts: Partial<Counts>, error: string | null) => {
    const [done] = await db.update(ingestionRuns).set({ status, ...counts, error, finishedAt: new Date() }).where(eq(ingestionRuns.id, run.id)).returning();
    return done;
  };

  // Permission gate: every condition is checked on every run, so revoking any of them stops collection at once.
  const refusal =
    !adapter ? "No adapter for this source" :
    !adapter.collect || adapter.accessMethod === "link_only" ? "This source is link-only; automated collection is not permitted" :
    source.permissionStatus !== "approved_collection" ? `Permission status is ${source.permissionStatus}; collection needs approved_collection` :
    !source.active ? "Source is switched off" :
    missingConfig(adapter, env, source.url).length ? `Missing configuration: ${missingConfig(adapter, env, source.url).join(", ")}` :
    null;
  if (refusal) return finish("skipped", {}, refusal);

  const counts: Counts = { collected: 0, created: 0, updated: 0, unchanged: 0, duplicates: 0, rejected: 0, markedStale: 0 };
  let result: CollectResult;
  try {
    const hosts = adapter!.allowedHosts({ sourceUrl: source.url, env });
    result = opts.deps?.collect ? await opts.deps.collect(adapter!) : await adapter!.collect!({ sourceUrl: source.url, sourceName: source.name, adapterKey: source.adapterKey, env, get: boundGetter(adapter!, hosts, { transport: opts.deps?.transport, resolver: opts.deps?.resolver }, opts.deps?.sleep) });
  } catch (err) {
    const message = safeError(err);
    await db.update(opportunitySources).set({ lastRunAt: now, lastFailureAt: now, lastError: message, consecutiveFailures: sql`${opportunitySources.consecutiveFailures} + 1`, nextRunAt: new Date(now.getTime() + Math.min(24 * 60, adapter!.defaultFrequencyMinutes) * 60_000) }).where(eq(opportunitySources.id, sourceId));
    log("warn", "ingestion.failed", { source: source.adapterKey, message });
    return finish("failed", counts, message);
  }

  counts.collected = result.records.length;
  const reg = registry();
  const seenRefIds: string[] = [];
  let cutShort = false;
  for (const raw of result.records) {
    if (opts.deadlineAt && Date.now() >= opts.deadlineAt) {
      cutShort = true;
      break;
    }
    const n = normalizeListing(raw, { supportedTypes: adapter!.supportedTypes, registry: reg, now });
    if (!n.ok) {
      counts.rejected++;
      continue;
    }
    try {
      const outcome = await upsertListing(db, source, n.listing, now);
      counts[outcome.kind]++;
      seenRefIds.push(outcome.refId);
    } catch (err) {
      counts.rejected++;
      log("warn", "ingestion.record_failed", { source: source.adapterKey, message: safeError(err) });
    }
  }

  // Only a run that saw the whole list may mark records missing; a run cut short by time continues next pass.
  if (result.complete && !cutShort) counts.markedStale = await markMissing(db, sourceId, seenRefIds, now);
  await expireStale(db, now);

  await db.update(opportunitySources).set({ lastRunAt: now, lastSuccessAt: now, lastImportAt: now, lastError: null, consecutiveFailures: 0, nextRunAt: cutShort ? now : new Date(now.getTime() + adapter!.defaultFrequencyMinutes * 60_000) }).where(eq(opportunitySources.id, sourceId));
  await audit(db, { actorId: opts.actorId ?? null, actorRole: opts.actorId ? "admin" : "system", action: "source.ingest", targetType: "source", targetId: sourceId, metadata: { ...counts, trigger: opts.trigger } });
  return finish(cutShort || (counts.rejected && counts.rejected === counts.collected) ? "partial" : "succeeded", counts, cutShort ? "Time budget reached; continues on the next pass" : null);
}

type SourceRow = typeof opportunitySources.$inferSelect;

async function upsertListing(db: Db, source: SourceRow, l: NormalizedListing, now: Date): Promise<{ kind: "created" | "updated" | "unchanged" | "duplicates"; refId: string }> {
  return db.transaction(async (tx) => {
    // 1. Same source record seen before?
    const [ref] = await tx.select().from(opportunitySourceRefs).where(and(eq(opportunitySourceRefs.sourceId, source.id), eq(opportunitySourceRefs.sourceRecordId, l.sourceRecordId)));
    if (ref) {
      const changed = ref.contentFingerprint !== l.fingerprint;
      await tx.update(opportunitySourceRefs).set({ lastSeenAt: now, missingSince: null, contentFingerprint: l.fingerprint, sourceUrl: l.sourceUrl ?? ref.sourceUrl }).where(eq(opportunitySourceRefs.id, ref.id));
      if (changed) await applyUpdate(tx as unknown as Db, ref.opportunityId, source, l, now);
      else await tx.update(opportunities).set({ lastCheckedAt: now, staleSince: null }).where(eq(opportunities.id, ref.opportunityId));
      return { kind: changed ? "updated" : "unchanged", refId: ref.id };
    }

    // 2. The same listing from another source (or re-keyed)? Multi-signal comparison against a bounded candidate set.
    const urls = [l.sourceUrl, l.applyUrl].filter((u): u is string => Boolean(u));
    const candidates = await tx
      .select()
      .from(opportunities)
      .where(
        and(
          or(
            eq(opportunities.contentFingerprint, l.fingerprint),
            urls.length ? inArray(opportunities.sourceUrl, urls) : sql`false`,
            urls.length ? inArray(opportunities.externalUrl, urls) : sql`false`,
            sql`btrim(lower(regexp_replace(regexp_replace(${opportunities.title}, '[^a-zA-Z0-9+# ]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'))) = ${normalizeTitle(l.title)}`,
            // The same role posted per city ("… (Pune)", "… - Bengaluru") at the same employer.
            and(
              sql`lower(${opportunities.organizationName}) = ${l.organization.toLowerCase()}`,
              sql`btrim(lower(regexp_replace(regexp_replace(${opportunities.title}, '[^a-zA-Z0-9+# ]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'))) like ${`${roleTitle(l.title)}%`}`,
            ),
          ),
          eq(opportunities.isSample, false),
        ),
      )
      .limit(50);
    const me = { sourceId: source.id, sourceRecordId: l.sourceRecordId, urls, fingerprint: l.fingerprint, title: l.title, organization: l.organization, locations: l.locations, workMode: l.workMode, description: l.description, deadline: l.deadline, employmentType: l.employmentType };
    for (const c of candidates) {
      // One rule for "same opening" here and on every page (dedupe.ts sameOpening), so feeds can't create what pages hide.
      const matchedBy = sameOpening(me, { sourceId: c.sourceId, sourceRecordId: c.sourceRecordId, urls: [c.sourceUrl, c.externalUrl], fingerprint: c.contentFingerprint, title: c.title, organization: c.organizationName, locations: c.locations, workMode: c.workMode, description: c.description, deadline: c.deadline, employmentType: c.employmentType });
      if (!matchedBy) continue;
      const [added] = await tx.insert(opportunitySourceRefs).values({ opportunityId: c.id, sourceId: source.id, sourceRecordId: l.sourceRecordId, sourceUrl: l.sourceUrl, contentFingerprint: l.fingerprint, matchedBy, firstSeenAt: now, lastSeenAt: now }).returning();
      // The same role in another city: one listing that names every city, never a second card. Only for listings that
      // came from a source feed: a listing an employer or admin posted on Avsar is never edited by a third-party feed
      // (it just gains the source reference, as before).
      const locations = [...new Set([...c.locations, ...l.locations])];
      const feedOwned = c.sourceId !== null && c.createdBy === null;
      await tx.update(opportunities).set({ lastCheckedAt: now, staleSince: null, ...(feedOwned && locations.length !== c.locations.length ? { locations } : {}) }).where(eq(opportunities.id, c.id));
      return { kind: "duplicates", refId: added.id };
    }

    // 3. New listing: always into review, never published by ingestion.
    const expired = l.deadline !== null && l.deadline <= now;
    const slug = `${slugify(`${l.title} ${l.organization}`) || "opportunity"}-${createHash("sha1").update(`${source.id}:${l.sourceRecordId}`).digest("hex").slice(0, 8)}`;
    const [row] = await tx.insert(opportunities).values({ ...columns(l, source), slug, status: expired ? "expired" : "in_review", importedAt: now, firstCollectedAt: now, lastCheckedAt: now, verificationState: "unverified", verification: "unverified" }).returning();
    await writeSkills(tx as unknown as Db, row.id, l);
    const [created] = await tx.insert(opportunitySourceRefs).values({ opportunityId: row.id, sourceId: source.id, sourceRecordId: l.sourceRecordId, sourceUrl: l.sourceUrl, contentFingerprint: l.fingerprint, matchedBy: "created", firstSeenAt: now, lastSeenAt: now }).returning();
    await tx.insert(opportunityVersions).values({ opportunityId: row.id, version: 1, snapshot: row as unknown as Record<string, unknown>, changedBy: null });
    // An approved OFFICIAL source listing it is evidence the listing exists at that source. Nothing more.
    if (source.authority === "official" || source.authority === "employer") {
      await setOpportunityVerification(tx as unknown as Db, row.id, "source_confirmed", { actor: { kind: "system" }, evidenceKind: "authorized_source", evidence: `Listed by ${source.name} (${source.permissionStatus})` });
    }
    return { kind: "created", refId: created.id };
  });
}

function columns(l: NormalizedListing, source: SourceRow) {
  return {
    title: l.title,
    category: l.type,
    employmentType: l.employmentType,
    organizationName: l.organization,
    description: l.description,
    workMode: l.workMode,
    locations: l.locations,
    compMin: l.compMin,
    compMax: l.compMax,
    compPeriod: l.compPeriod,
    unpaid: l.unpaid,
    experienceMinYears: l.experienceMinYears,
    experienceMaxYears: l.experienceMaxYears,
    deadline: l.deadline,
    applicationMethod: "external" as const,
    externalUrl: l.applyUrl ?? l.sourceUrl,
    sourceId: source.id,
    sourceUrl: l.sourceUrl ?? l.applyUrl,
    sourceProvider: source.name,
    sourceRecordId: l.sourceRecordId,
    contentFingerprint: l.fingerprint,
    postedAt: l.postedAt,
    sourceUpdatedAt: l.sourceUpdatedAt,
    educationRequirementText: l.educationText,
    eligibilityText: l.eligibilityText,
    contentFlags: l.flags,
    details: { workModeAssumed: l.workModeAssumed, normalizationNotes: l.notes },
  };
}

async function writeSkills(db: Db, opportunityId: string, l: NormalizedListing) {
  await db.delete(opportunitySkills).where(eq(opportunitySkills.opportunityId, opportunityId));
  if (l.skills.length) await db.insert(opportunitySkills).values(l.skills.map((s) => ({ opportunityId, name: s.name, normalized: s.normalized, required: s.required, origin: s.origin, conceptId: s.conceptId }))).onConflictDoNothing();
}

async function applyUpdate(db: Db, opportunityId: string, source: SourceRow, l: NormalizedListing, now: Date) {
  const [cur] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).for("update");
  if (!cur) return;
  // Only the source that created a listing may change its content; a second source only adds a reference.
  if (cur.sourceId !== source.id) {
    await db.update(opportunities).set({ lastCheckedAt: now, staleSince: null }).where(eq(opportunities.id, opportunityId));
    return;
  }
  const expired = l.deadline !== null && l.deadline <= now;
  // New instruction-like text on a live listing sends it back to review before anyone sees it.
  const backToReview = l.flags.length > 0 && cur.status === "published";
  const [row] = await db
    .update(opportunities)
    .set({ ...columns(l, source), version: cur.version + 1, updatedAt: now, lastCheckedAt: now, staleSince: null, status: expired && cur.status === "published" ? "expired" : backToReview ? "in_review" : cur.status, publishedAt: backToReview ? null : cur.publishedAt })
    .where(eq(opportunities.id, opportunityId))
    .returning();
  await writeSkills(db, opportunityId, l);
  await db.insert(opportunityVersions).values({ opportunityId, version: row.version, snapshot: row as unknown as Record<string, unknown>, changedBy: null });
  await audit(db, { actorId: null, actorRole: "system", action: "opportunity.source_update", targetType: "opportunity", targetId: opportunityId, metadata: { sourceId: source.id, version: row.version, backToReview, expired } });
}

/** After a complete successful run: references this source no longer lists are marked missing; listings with no live reference become stale. */
async function markMissing(db: Db, sourceId: string, seenRefIds: string[], now: Date): Promise<number> {
  const missing = await db
    .update(opportunitySourceRefs)
    .set({ missingSince: now })
    .where(and(eq(opportunitySourceRefs.sourceId, sourceId), isNull(opportunitySourceRefs.missingSince), seenRefIds.length ? sql`${opportunitySourceRefs.id} not in ${seenRefIds}` : sql`true`))
    .returning({ opportunityId: opportunitySourceRefs.opportunityId });
  if (!missing.length) return 0;
  const ids = [...new Set(missing.map((m) => m.opportunityId))];
  const stale = await db
    .update(opportunities)
    .set({ staleSince: now })
    .where(and(inArray(opportunities.id, ids), isNull(opportunities.staleSince), sql`not exists (select 1 from ${opportunitySourceRefs} r where r.opportunity_id = ${opportunities.id} and r.missing_since is null)`))
    .returning({ id: opportunities.id });
  return stale.length;
}

/** Published listings past their deadline, or stale for STALE_EXPIRE_DAYS, become expired (with a verification event). */
export async function expireStale(db: Db, now = new Date()) {
  const rows = await db
    .select({ id: opportunities.id, state: opportunities.verificationState })
    .from(opportunities)
    .where(and(eq(opportunities.status, "published"), or(lte(opportunities.deadline, now), lt(opportunities.staleSince, new Date(now.getTime() - STALE_EXPIRE_DAYS * DAY)))));
  for (const r of rows) {
    await db.update(opportunities).set({ status: "expired", updatedAt: now }).where(eq(opportunities.id, r.id));
    if (r.state !== "expired" && r.state !== "rejected") await setOpportunityVerification(db, r.id, "expired", { actor: { kind: "system" }, evidenceKind: "system_expiry", reason: "Deadline passed or no longer listed by any source" }).catch(() => undefined);
  }
  return rows.length;
}

/**
 * Atomically leases the next due source (approved, switched on, next run due). The lease moves next_run_at
 * forward by LEASE_MINUTES first, so two overlapping cron invocations (or the cron and the worker) can never run
 * the same source; the run itself then sets the real next time (success: frequency; failure: backoff).
 */
export const LEASE_MINUTES = 30;
export async function claimDueSource(db: Db, now = new Date()): Promise<string | null> {
  const res = await db.execute(sql`
    update opportunity_sources set next_run_at = ${new Date(now.getTime() + LEASE_MINUTES * 60_000)}
    where id = (
      select id from opportunity_sources
      where permission_status = 'approved_collection' and active = true and (next_run_at is null or next_run_at <= ${now})
      order by next_run_at asc nulls first, id
      limit 1 for update skip locked)
    returning id`);
  return (res as unknown as { rows: { id: string }[] }).rows[0]?.id ?? null;
}

export interface ScheduledRunSummary { sources: { sourceId: string; status: string; collected: number; created: number; updated: number; duplicates: number; rejected: number }[]; expired: number; stoppedBy: "done" | "time_budget" | "max_sources"; elapsedMs: number }

/**
 * One scheduled pass (Vercel Cron or worker): runs due sources one at a time until none are due, the time budget
 * is spent, or `maxSources` ran; then expires stale and past-deadline listings. Sources left over stay due and are
 * picked up by the next pass, so a short invocation never loses work.
 */
export async function runScheduledIngestion(db: Db, opts: { budgetMs: number; maxSources?: number; env?: Record<string, string | undefined>; deps?: RunDeps; now?: () => Date } = { budgetMs: 45_000 }): Promise<ScheduledRunSummary> {
  const clock = opts.now ?? (() => new Date());
  const started = Date.now();
  const sources: ScheduledRunSummary["sources"] = [];
  let stoppedBy: ScheduledRunSummary["stoppedBy"] = "done";
  for (;;) {
    if (Date.now() - started >= opts.budgetMs) { stoppedBy = "time_budget"; break; }
    if (sources.length >= (opts.maxSources ?? 25)) { stoppedBy = "max_sources"; break; }
    const id = await claimDueSource(db, clock());
    if (!id) break;
    const run = await runIngestion(db, id, { trigger: "schedule", env: opts.env, deps: opts.deps, now: clock(), deadlineAt: started + opts.budgetMs });
    sources.push({ sourceId: id, status: run.status, collected: run.collected, created: run.created, updated: run.updated, duplicates: run.duplicates, rejected: run.rejected });
  }
  // Past-deadline and long-stale published listings → expired (with a system_expiry verification event).
  const expired = await expireStale(db, clock());
  return { sources, expired, stoppedBy, elapsedMs: Date.now() - started };
}

/** Enqueue-free scheduling: returns the ids of approved, active, configured sources whose next run is due. */
export async function dueSources(db: Db, now = new Date(), env: Record<string, string | undefined> = process.env) {
  const rows = await db
    .select()
    .from(opportunitySources)
    .where(and(eq(opportunitySources.permissionStatus, "approved_collection"), eq(opportunitySources.active, true), or(isNull(opportunitySources.nextRunAt), lte(opportunitySources.nextRunAt, now))));
  return rows.filter((s) => sourceHealth(s, env) !== "not_configured").map((s) => s.id);
}

export type CoverageMode = "automated" | "links_only" | "import_only";

/** How a source actually contributes today, and the one action that would unblock it (null = nothing needed). */
export function sourceCoverage(s: { adapterKey: string | null; url: string | null; active: boolean; permissionStatus: string; consecutiveFailures: number; lastError: string | null; kind: string }, env: Record<string, string | undefined> = process.env): { mode: CoverageMode; action: string | null } {
  const a = adapterFor(s.adapterKey);
  if (s.permissionStatus === "disabled") return { mode: a ? "links_only" : "import_only", action: "Disabled by an admin." };
  if (!a) return { mode: "import_only", action: "Add listings from this source in Import Review (JSON or CSV)." };
  if (!a.collect || a.accessMethod === "link_only") return { mode: "links_only", action: "None. Students get official search links; automated collection is not permitted by this source." };
  const missing = missingConfig(a, env, s.url);
  if (missing.length) return { mode: "links_only", action: `Students get official search links meanwhile. To collect automatically: obtain an authorized feed from the portal owner, then set ${missing.join("; ")}.` };
  if (s.permissionStatus !== "approved_collection") return { mode: "automated", action: "Record permission as “Approved for collection” with the evidence (agreement, or the employer's public job board URL)." };
  if (!s.active) return { mode: "automated", action: "Switch the source on." };
  if (s.consecutiveFailures >= 3) return { mode: "automated", action: `Failing: ${s.lastError ?? "see the last run"}.` };
  return { mode: "automated", action: null };
}

/** Families whose official search links students may see (every adapter source not disabled by an admin). */
export async function discoveryFamilies(db: Db): Promise<Set<string>> {
  const rows = await db.select({ key: opportunitySources.adapterKey, status: opportunitySources.permissionStatus }).from(opportunitySources);
  return new Set(rows.filter((r) => r.key && r.status !== "disabled").map((r) => r.key!.split(":")[0]));
}

/**
 * Human-approved bulk publication of a source's listings that are in review and pass every publish check
 * (including flagged-text and https checks). Each listing goes through the normal workflow and audit trail.
 */
export async function publishReadyFromSource(db: Db, sourceId: string, actorId: string, limit = 200) {
  const { transitionOpportunity, TransitionError } = await import("./opportunities");
  const rows = await db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.sourceId, sourceId), eq(opportunities.status, "in_review"))).limit(limit);
  let published = 0;
  let skipped = 0;
  for (const r of rows) {
    try {
      await transitionOpportunity(db, r.id, "approved", actorId, "Bulk approval from Source Manager");
      await transitionOpportunity(db, r.id, "published", actorId, "Bulk publication from Source Manager");
      published++;
    } catch (err) {
      if (!(err instanceof TransitionError)) throw err;
      skipped++;
    }
  }
  return { published, skipped };
}

export async function listSourcesForAdmin(db: Db) {
  const sources = await db.select().from(opportunitySources).orderBy(opportunitySources.name);
  const [runs, counts] = await Promise.all([
    db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(500),
    db.select({ sourceId: opportunities.sourceId, status: opportunities.status, n: sql<number>`count(*)::int` }).from(opportunities).where(sql`${opportunities.sourceId} is not null`).groupBy(opportunities.sourceId, opportunities.status),
  ]);
  return sources.map((s) => {
    const adapter = adapterFor(s.adapterKey);
    const mine = runs.filter((r) => r.sourceId === s.id);
    return {
      ...s,
      adapter: adapter ? { family: adapter.family, accessMethod: adapter.accessMethod, supportedTypes: adapter.supportedTypes, rateLimit: adapter.rateLimit, frequencyMinutes: adapter.defaultFrequencyMinutes, config: adapter.config.map((c) => ({ env: c.env, secret: c.secret, set: Boolean(process.env[c.env]), description: c.description })), mapping: adapter.mapping } : null,
      missingConfig: adapter ? missingConfig(adapter, process.env, s.url) : [],
      health: sourceHealth(s),
      coverage: sourceCoverage(s),
      listings: Object.fromEntries(counts.filter((x) => x.sourceId === s.id).map((x) => [x.status, x.n])) as Record<string, number>,
      lastRun: mine[0] ?? null,
      totals: mine.slice(0, 20).reduce((t, r) => ({ collected: t.collected + r.collected, created: t.created + r.created, rejected: t.rejected + r.rejected, duplicates: t.duplicates + r.duplicates, failures: t.failures + (r.status === "failed" ? 1 : 0) }), { collected: 0, created: 0, rejected: 0, duplicates: 0, failures: 0 }),
    };
  });
}
