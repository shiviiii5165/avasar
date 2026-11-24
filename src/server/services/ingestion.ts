import "server-only";

import { createHash } from "node:crypto";

import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { audit } from "../audit";
import type { Db } from "../db/client";
import { ingestionRuns, opportunities, opportunitySkills, opportunitySourceRefs, opportunitySources, opportunityVersions } from "../db/schema";
import { ADAPTERS, adapterFor, boundGetter, missingConfig, type CollectResult, type SourceAdapter } from "../ingestion/adapters";
import { compareListings } from "../ingestion/dedupe";
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
  for (const a of ADAPTERS.filter((x) => x.family !== "employer_careers")) {
    await db
      .insert(opportunitySources)
      .values({ name: a.name, kind: a.accessMethod === "link_only" ? "manual" : "feed", url: a.homepage, termsNote: a.termsNote, active: false, adapterKey: a.family, authority: a.authority, permissionStatus: "unreviewed" })
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
export async function runIngestion(db: Db, sourceId: string, opts: { trigger: "schedule" | "manual"; actorId?: string | null; env?: Record<string, string | undefined>; now?: Date; deps?: RunDeps } = { trigger: "schedule" }) {
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
    result = opts.deps?.collect ? await opts.deps.collect(adapter!) : await adapter!.collect!({ sourceUrl: source.url, env, get: boundGetter(adapter!, hosts, { transport: opts.deps?.transport, resolver: opts.deps?.resolver }, opts.deps?.sleep) });
  } catch (err) {
    const message = safeError(err);
    await db.update(opportunitySources).set({ lastRunAt: now, lastFailureAt: now, lastError: message, consecutiveFailures: sql`${opportunitySources.consecutiveFailures} + 1`, nextRunAt: new Date(now.getTime() + Math.min(24 * 60, adapter!.defaultFrequencyMinutes) * 60_000) }).where(eq(opportunitySources.id, sourceId));
    log("warn", "ingestion.failed", { source: source.adapterKey, message });
    return finish("failed", counts, message);
  }

  counts.collected = result.records.length;
  const reg = registry();
  const seenRefIds: string[] = [];
  for (const raw of result.records) {
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

  if (result.complete) counts.markedStale = await markMissing(db, sourceId, seenRefIds, now);
  await expireStale(db, now);

  await db.update(opportunitySources).set({ lastRunAt: now, lastSuccessAt: now, lastImportAt: now, lastError: null, consecutiveFailures: 0, nextRunAt: new Date(now.getTime() + adapter!.defaultFrequencyMinutes * 60_000) }).where(eq(opportunitySources.id, sourceId));
  await audit(db, { actorId: opts.actorId ?? null, actorRole: opts.actorId ? "admin" : "system", action: "source.ingest", targetType: "source", targetId: sourceId, metadata: { ...counts, trigger: opts.trigger } });
  return finish(counts.rejected && counts.rejected === counts.collected ? "partial" : "succeeded", counts, null);
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
            sql`btrim(lower(regexp_replace(regexp_replace(${opportunities.title}, '[^a-zA-Z0-9+# ]+', ' ', 'g'), '\s+', ' ', 'g'))) = ${normalizeTitle(l.title)}`,
          ),
          eq(opportunities.isSample, false),
        ),
      )
      .limit(50);
    const me = { sourceId: source.id, sourceRecordId: l.sourceRecordId, urls, fingerprint: l.fingerprint, title: l.title, organization: l.organization, locations: l.locations, workMode: l.workMode, description: l.description, deadline: l.deadline };
    for (const c of candidates) {
      const d = compareListings(me, { sourceId: c.sourceId, sourceRecordId: c.sourceRecordId, urls: [c.sourceUrl, c.externalUrl], fingerprint: c.contentFingerprint, title: c.title, organization: c.organizationName, locations: c.locations, workMode: c.workMode, description: c.description, deadline: c.deadline });
      if (!d.duplicate) continue;
      const [added] = await tx.insert(opportunitySourceRefs).values({ opportunityId: c.id, sourceId: source.id, sourceRecordId: l.sourceRecordId, sourceUrl: l.sourceUrl, contentFingerprint: l.fingerprint, matchedBy: d.matchedBy!, firstSeenAt: now, lastSeenAt: now }).returning();
      await tx.update(opportunities).set({ lastCheckedAt: now, staleSince: null }).where(eq(opportunities.id, c.id));
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

/** Enqueue-free scheduling: returns the ids of approved, active, configured sources whose next run is due. */
export async function dueSources(db: Db, now = new Date(), env: Record<string, string | undefined> = process.env) {
  const rows = await db
    .select()
    .from(opportunitySources)
    .where(and(eq(opportunitySources.permissionStatus, "approved_collection"), eq(opportunitySources.active, true), or(isNull(opportunitySources.nextRunAt), lte(opportunitySources.nextRunAt, now))));
  return rows.filter((s) => sourceHealth(s, env) !== "not_configured").map((s) => s.id);
}

export async function listSourcesForAdmin(db: Db) {
  const sources = await db.select().from(opportunitySources).orderBy(opportunitySources.name);
  const runs = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(200);
  return sources.map((s) => {
    const adapter = adapterFor(s.adapterKey);
    const mine = runs.filter((r) => r.sourceId === s.id);
    return {
      ...s,
      adapter: adapter ? { family: adapter.family, accessMethod: adapter.accessMethod, supportedTypes: adapter.supportedTypes, rateLimit: adapter.rateLimit, frequencyMinutes: adapter.defaultFrequencyMinutes, config: adapter.config.map((c) => ({ env: c.env, secret: c.secret, set: Boolean(process.env[c.env]), description: c.description })), mapping: adapter.mapping } : null,
      missingConfig: adapter ? missingConfig(adapter, process.env, s.url) : [],
      health: sourceHealth(s),
      lastRun: mine[0] ?? null,
      totals: mine.slice(0, 20).reduce((t, r) => ({ collected: t.collected + r.collected, rejected: t.rejected + r.rejected, duplicates: t.duplicates + r.duplicates, failures: t.failures + (r.status === "failed" ? 1 : 0) }), { collected: 0, rejected: 0, duplicates: 0, failures: 0 }),
    };
  });
}
