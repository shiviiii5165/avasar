import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createMemoryDb, type Db } from "../db/client";
import { sessions } from "../db/schema";
import { SESSION_MAX_MS, SESSION_TTL_MS } from "./cookie";
import { createSession, resolveSession, revokeSession, upsertIdentity } from "./identity";

/** Active students stay signed in (sliding expiry), up to a maximum lifetime; revoked or expired sessions never resolve. */
describe("sliding sessions", () => {
  let db: Db;
  let identityId: string;
  beforeAll(async () => {
    db = await createMemoryDb();
    identityId = (await upsertIdentity(db, { provider: "dev", subject: "slide-1", email: null, emailVerified: false, name: "S" })).id;
  });
  const row = async (token: string) => (await db.select().from(sessions)).find((s) => s.tokenHash && s.revokedAt === null && s.identityId === identityId && token)!;

  it("using the session extends it by the TTL", async () => {
    const s = await createSession(db, identityId);
    const r = await row(s.token);
    const day = 86_400_000;
    // Signed in 6 days ago, last active 6 days ago, expiring tomorrow.
    await db.update(sessions).set({ createdAt: new Date(Date.now() - 6 * day), lastSeenAt: new Date(Date.now() - 6 * day), expiresAt: new Date(Date.now() + day) }).where(eq(sessions.id, r.id));
    expect(await resolveSession(db, s.token)).not.toBeNull();
    const [after] = await db.select().from(sessions).where(eq(sessions.id, r.id));
    expect(after.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
    await revokeSession(db, s.token);
    expect(await resolveSession(db, s.token)).toBeNull();
  });

  it("never beyond the maximum lifetime, and an expired session stays expired", async () => {
    const s = await createSession(db, identityId);
    const [r] = (await db.select().from(sessions)).filter((x) => x.revokedAt === null).slice(-1);
    const created = Date.now() - SESSION_MAX_MS + 2 * 86_400_000; // 2 days before the cap
    await db.update(sessions).set({ createdAt: new Date(created), lastSeenAt: new Date(Date.now() - 86_400_000), expiresAt: new Date(Date.now() + 3_600_000) }).where(eq(sessions.id, r.id));
    await resolveSession(db, s.token);
    const [capped] = await db.select().from(sessions).where(eq(sessions.id, r.id));
    expect(capped.expiresAt.getTime()).toBeLessThanOrEqual(created + SESSION_MAX_MS);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, r.id));
    expect(await resolveSession(db, s.token)).toBeNull();
  });
});
