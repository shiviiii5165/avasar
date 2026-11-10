import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "../db/client";
import * as schema from "../db/schema";
import { achievements, adminRoles, candidateSkills, notifications, opportunities, projects, skillEvidence } from "../db/schema";
import { createSession, resolveSession, upsertIdentity } from "../auth/identity";
import { seedSamples } from "../seed";
import { listSaved, toggleSaved } from "./engagement";
import { unreadCount } from "./notifications";
import { listOpenOpportunities, publicVisibility, withDetails } from "./opportunities";
import { ensureProfile, loadProfile } from "./profiles";

/**
 * Regression: dashboard navigation was slow because each page waited on several SEQUENTIAL database round trips
 * (session, then roles/profile; profile, then sections, then evidence, then achievements). Against a remote
 * database every wave costs a full network round trip. These tests count waves: a wave starts when a query is
 * sent while no other query is in flight. Each query is held for a few milliseconds so parallel ones overlap.
 */
let db: Db;
const stats = { queries: 0, waves: 0, inFlight: 0 };

beforeAll(async () => {
  const client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "src/server/db/migrations") });
  const query = client.query.bind(client);
  (client as unknown as { query: typeof query }).query = (async (...args: Parameters<typeof query>) => {
    stats.queries++;
    if (stats.inFlight === 0) stats.waves++;
    stats.inFlight++;
    try {
      await new Promise((r) => setTimeout(r, 5));
      return await query(...args);
    } finally {
      stats.inFlight--;
    }
  }) as typeof query;
});

beforeEach(() => { stats.queries = 0; stats.waves = 0; });
const reset = () => { stats.queries = 0; stats.waves = 0; };

describe("database round trips on every dashboard navigation", () => {
  it("resolves a session with roles and profile in one round trip", async () => {
    const who = await upsertIdentity(db, { provider: "dev", subject: "rt-1", email: null, emailVerified: false, name: "RT" });
    const profile = await ensureProfile(db, who.id, "RT");
    await db.insert(adminRoles).values([{ identityId: who.id, role: "moderator" }, { identityId: who.id, role: "support_agent" }]);
    const { token } = await createSession(db, who.id);
    reset();
    const s = await resolveSession(db, token);
    expect(stats.waves).toBe(1);
    expect(s?.identity.id).toBe(who.id);
    expect(s?.profileId).toBe(profile!.id);
    expect([...s!.roles].sort()).toEqual(["moderator", "support_agent"]);
  });

  it("still returns no roles and no profile when there are none, and rejects bad tokens", async () => {
    const who = await upsertIdentity(db, { provider: "dev", subject: "rt-2", email: null, emailVerified: false, name: null });
    const { token } = await createSession(db, who.id);
    const s = await resolveSession(db, token);
    expect(s?.roles).toEqual([]);
    expect(s?.profileId).toBeNull();
    expect(await resolveSession(db, "x".repeat(40))).toBeNull();
  });

  it("loads a full profile in one round trip, with evidence counts and achievements intact", async () => {
    const who = await upsertIdentity(db, { provider: "dev", subject: "rt-3", email: null, emailVerified: false, name: "Ev" });
    const profileId = (await ensureProfile(db, who.id, "Ev"))!.id;
    const [py] = await db.insert(candidateSkills).values([
      { profileId, name: "Python", normalized: "python" },
      { profileId, name: "SQL", normalized: "sql" },
    ]).returning();
    await db.insert(skillEvidence).values([{ skillId: py.id, kind: "link" }, { skillId: py.id, kind: "certification" }]);
    await db.insert(projects).values({ profileId, title: "Crop model", skills: ["Python"] });
    await db.insert(achievements).values({ profileId, kind: "publication", title: "A paper" });
    reset();
    const p = await loadProfile(db, profileId);
    expect(stats.waves).toBe(1);
    expect(p?.skills.find((s) => s.name === "Python")?.evidenceCount).toBe(3); // 2 explicit + 1 project
    expect(p?.skills.find((s) => s.name === "SQL")?.evidenceCount).toBe(0);
    expect(p?.achievements.map((a) => a.title)).toEqual(["A paper"]);
    expect(p?.projects).toHaveLength(1);
  });

  it("returns null for an unknown profile without extra queries", async () => {
    expect(await loadProfile(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(stats.waves).toBe(1);
  });

  it("lists open opportunities with skills and eligibility in one round trip, identical to loading them separately", async () => {
    await seedSamples(db);
    reset();
    const open = await listOpenOpportunities(db);
    expect(stats.waves).toBe(1);
    expect(open.length).toBe(12);
    const rows = await db.select().from(opportunities).where(publicVisibility());
    const separate = new Map((await withDetails(db, rows)).map((o) => [o.id, o]));
    const bySkill = (a: { normalized: string }, b: { normalized: string }) => a.normalized.localeCompare(b.normalized);
    for (const o of open) {
      const ref = separate.get(o.id)!;
      expect([...o.skills].sort(bySkill)).toEqual([...ref.skills].sort(bySkill));
      expect(o.eligibility).toEqual(ref.eligibility);
      expect(o.deadline).toBeInstanceOf(Date); // listing columns keep their types
    }
    expect(open.some((o) => o.skills.length > 0 && o.eligibility?.educationLevels !== undefined)).toBe(true);
  });

  it("lists saved opportunities with their details in one round trip", async () => {
    const who = await upsertIdentity(db, { provider: "dev", subject: "rt-5", email: null, emailVerified: false, name: null });
    const [first, second] = await listOpenOpportunities(db);
    await toggleSaved(db, who.id, first.id);
    await toggleSaved(db, who.id, second.id);
    reset();
    const saved = await listSaved(db, who.id);
    expect(stats.waves).toBe(1);
    expect(saved.map((o) => o.id).sort()).toEqual([first.id, second.id].sort());
    expect(saved.find((o) => o.id === first.id)?.skills.length).toBe(first.skills.length);
  });

  it("counts unread notifications in the database", async () => {
    const who = await upsertIdentity(db, { provider: "dev", subject: "rt-4", email: null, emailVerified: false, name: null });
    await db.insert(notifications).values([
      { identityId: who.id, kind: "account", dedupeKey: "rt-4-a", title: "A" },
      { identityId: who.id, kind: "account", dedupeKey: "rt-4-b", title: "B" },
      { identityId: who.id, kind: "account", dedupeKey: "rt-4-c", title: "C", readAt: new Date() },
    ]);
    reset();
    expect(await unreadCount(db, who.id)).toBe(2);
    expect(stats.queries).toBe(1);
  });
});
