import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { audit } from "../audit";
import type { Db } from "../db/client";
import { achievements, candidateProfiles, candidateSkills, certifications, education, experiences, projects } from "../db/schema";
import { mapProjection, projectionSchema, type MappedProfile } from "../integrations/tathastu-profile";

/**
 * Applies an AI Tathastu profile to the Avsar profile. Idempotent and transactional.
 *
 * Field ownership:
 *  - Section rows with source = 'ai_tathastu' are owned by AI Tathastu and replaced on every sync.
 *    A section the student stopped sharing is removed (consent withdrawn).
 *  - Rows with source = 'avsar' are the student's own additions and are never touched.
 *  - A skill the student added in Avsar wins over the same imported skill (no duplicate row).
 *  - Identity fields (name, headline, city, country) are filled from AI Tathastu unless the student has
 *    edited them in Avsar since the last import: then the Avsar value wins and is no longer tracked.
 */
const IDENTITY_FIELDS = ["fullName", "headline", "city", "country"] as const;

export class ProfileSyncError extends Error {
  constructor(public readonly code: "INVALID_PROFILE" | "SUBJECT_MISMATCH" | "AUDIENCE_MISMATCH" | "UNAVAILABLE" | "DISCONNECTED", message: string) {
    super(message);
  }
}

export async function applyTathastuProfile(db: Db, profileId: string, raw: unknown, expectedSubject: string, actorId: string | null, expectedAudience?: string): Promise<MappedProfile> {
  const parsed = projectionSchema.safeParse(raw);
  if (!parsed.success) throw new ProfileSyncError("INVALID_PROFILE", "AI Tathastu returned a profile Avsar couldn't read.");
  const m = mapProjection(parsed.data);
  if (m.subject !== expectedSubject) throw new ProfileSyncError("SUBJECT_MISMATCH", "The profile doesn't belong to the signed-in account.");
  if (expectedAudience && parsed.data.audience && parsed.data.audience !== expectedAudience) throw new ProfileSyncError("AUDIENCE_MISMATCH", "The profile was issued for a different app.");

  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(candidateProfiles).where(eq(candidateProfiles.id, profileId)).for("update");
    if (!cur) throw new ProfileSyncError("INVALID_PROFILE", "Profile not found");

    // Identity: import unless the student owns the current value.
    const imported = { ...cur.importedFields };
    const updates: Record<string, unknown> = {};
    for (const f of IDENTITY_FIELDS) {
      const incoming = m.identity[f];
      const current = cur[f];
      const studentOwned = current !== null && current !== "" && imported[f] !== current;
      if (studentOwned) {
        delete imported[f];
        continue;
      }
      if (incoming) {
        updates[f] = incoming;
        imported[f] = incoming;
      } else if (imported[f] !== undefined && imported[f] === current) {
        updates[f] = null; // the source removed it and the student never changed it
        delete imported[f];
      }
    }
    // Career goal from AI Tathastu becomes a preferred role unless the student already listed it.
    let preferredRoles = cur.preferredRoles;
    const prevRole = imported.careerRole;
    if (prevRole && prevRole !== m.identity.careerRole) preferredRoles = preferredRoles.filter((r) => r !== prevRole);
    if (m.identity.careerRole) {
      if (!preferredRoles.includes(m.identity.careerRole)) preferredRoles = [m.identity.careerRole, ...preferredRoles];
      imported.careerRole = m.identity.careerRole;
    } else delete imported.careerRole;

    // Replace AI Tathastu-owned rows per section.
    // rows === null: section not confirmed by the provider → leave existing imported rows untouched.
    const replace = async <T extends { id: unknown }>(table: typeof education | typeof experiences | typeof projects | typeof certifications | typeof achievements, rows: Record<string, unknown>[] | null) => {
      if (rows === null) return null as unknown as T;
      await tx.delete(table).where(and(eq(table.profileId, profileId), eq(table.source, "ai_tathastu")));
      if (rows?.length) await tx.insert(table).values(rows.map((r) => ({ ...r, profileId, source: "ai_tathastu" })) as never);
      return null as unknown as T;
    };
    await replace(education, m.education);
    await replace(experiences, m.experiences);
    await replace(projects, m.projects);
    await replace(certifications, m.certifications);
    await replace(achievements, m.achievements);

    if (m.skills !== null) await tx.delete(candidateSkills).where(and(eq(candidateSkills.profileId, profileId), eq(candidateSkills.source, "ai_tathastu")));
    if (m.skills?.length) {
      const own = await tx.select({ normalized: candidateSkills.normalized }).from(candidateSkills).where(and(eq(candidateSkills.profileId, profileId), inArray(candidateSkills.normalized, m.skills.map((x) => x.normalized))));
      const ownSet = new Set(own.map((o) => o.normalized));
      const rows = m.skills.filter((x) => !ownSet.has(x.normalized)).map((x) => ({ profileId, source: "ai_tathastu" as const, sourceKey: x.sourceKey, name: x.name, normalized: x.normalized, level: x.level }));
      if (rows.length) await tx.insert(candidateSkills).values(rows);
    }

    await tx
      .update(candidateProfiles)
      .set({
        ...updates,
        preferredRoles,
        importedFields: imported,
        aitInsights: m.insights,
        aitScopes: m.scopes,
        aitSyncedAt: new Date(),
        aitSyncStatus: m.withheld.length || m.unconfirmed.length ? "partial" : "ok",
        aitSyncError: m.unconfirmed.length ? `AI Tathastu didn't confirm: ${m.unconfirmed.join(", ")}. Previously imported data for these was kept.` : null,
        updatedAt: new Date(),
      })
      .where(eq(candidateProfiles.id, profileId));
    await audit(tx, { actorId, actorRole: "system", action: "profile.ait_sync", targetType: "profile", targetId: profileId, metadata: { withheld: m.withheld, unconfirmed: m.unconfirmed } });
  });
  return m;
}

export async function recordSyncFailure(db: Db, profileId: string, message: string) {
  await db.update(candidateProfiles).set({ aitSyncStatus: "failed", aitSyncError: message.slice(0, 300), updatedAt: new Date() }).where(eq(candidateProfiles.id, profileId));
}

/** Server-side fetch of the profile with the short-lived access token. The token is never stored. */
export async function fetchTathastuProfile(profileUrl: string, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(profileUrl, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    throw new ProfileSyncError("UNAVAILABLE", "AI Tathastu didn't respond.");
  }
  // 401 invalid_token: the student disconnected Avsar or their AI Tathastu sessions were revoked. Imported
  // data is kept (not silently deleted); the profile page offers Reconnect.
  if (res.status === 401) throw new ProfileSyncError("DISCONNECTED", "Avsar is no longer connected to your AI Tathastu account. Reconnect to refresh your profile.");
  if (res.status === 403) throw new ProfileSyncError("UNAVAILABLE", "Profile sharing with Avsar is switched off on AI Tathastu right now.");
  if (!res.ok) throw new ProfileSyncError("UNAVAILABLE", `AI Tathastu returned ${res.status}. Try refreshing later.`);
  try {
    return await res.json();
  } catch {
    throw new ProfileSyncError("INVALID_PROFILE", "AI Tathastu returned a profile Avsar couldn't read.");
  }
}
