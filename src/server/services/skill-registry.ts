import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import type { Db } from "../db/client";
import { roleProfiles, roleSkills, skillAliases, skillConcepts, skillRelations } from "../db/schema";
import { normalizeSkill } from "../domain/skills";
import { CONCEPTS, REGISTRY_VERSION, RELATIONS, ROLES } from "../intelligence/registry-data";

/** Writes the curated registry into its tables (idempotent upserts), so admins and reports can query it. */
export async function syncSkillRegistry(db: Db) {
  await db.transaction(async (tx) => {
    for (const c of CONCEPTS) {
      await tx
        .insert(skillConcepts)
        .values({ id: c.id, displayName: c.name, category: c.category, parentId: c.parent ?? null, taxonomySource: "avsar", taxonomyVersion: REGISTRY_VERSION })
        .onConflictDoUpdate({ target: skillConcepts.id, set: { displayName: c.name, category: c.category, parentId: c.parent ?? null, taxonomyVersion: REGISTRY_VERSION }, setWhere: sql`${skillConcepts.taxonomySource} = 'avsar'` });
    }
    for (const c of CONCEPTS) {
      for (const a of [c.id.replace(/_/g, " "), c.name, ...(c.aliases ?? [])]) {
        await tx.insert(skillAliases).values({ alias: normalizeSkill(a), conceptId: c.id, locale: c.locale ?? "en" }).onConflictDoNothing();
      }
    }
    for (const [fromId, toId, kind] of RELATIONS) await tx.insert(skillRelations).values({ fromId, toId, kind }).onConflictDoNothing();
    for (const r of ROLES) {
      await tx.insert(roleProfiles).values({ id: r.id, title: r.title, aliases: r.aliases, taxonomyVersion: REGISTRY_VERSION }).onConflictDoUpdate({ target: roleProfiles.id, set: { title: r.title, aliases: r.aliases, taxonomyVersion: REGISTRY_VERSION } });
      for (const id of r.essential) await tx.insert(roleSkills).values({ roleId: r.id, conceptId: id, importance: "essential" }).onConflictDoNothing();
      for (const id of r.optional) await tx.insert(roleSkills).values({ roleId: r.id, conceptId: id, importance: "optional" }).onConflictDoNothing();
    }
  });
}

/**
 * Imports concepts from an external taxonomy file (ESCO or O*NET download) with their REAL URIs and version.
 * Validates every row; nothing is created without a URI from the file. Existing curated concepts are linked
 * (taxonomy URI recorded) only through an explicit `mapsTo` in the file, never by name similarity.
 */
export const taxonomyImportSchema = z.object({
  source: z.enum(["esco", "onet"]),
  version: z.string().min(1).max(40),
  concepts: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9_]{2,60}$/), uri: z.string().url().startsWith("http").max(300), name: z.string().min(1).max(120), category: z.string().min(1).max(40), aliases: z.array(z.string().max(100)).max(50).default([]), mapsTo: z.string().optional() }))
    .max(20_000),
});

export async function importTaxonomy(db: Db, input: unknown) {
  const data = taxonomyImportSchema.parse(input);
  let added = 0;
  await db.transaction(async (tx) => {
    for (const c of data.concepts) {
      const id = c.mapsTo ?? `${data.source}_${c.id}`;
      await tx
        .insert(skillConcepts)
        .values({ id, displayName: c.name, category: c.category, taxonomySource: data.source, taxonomyUri: c.uri, taxonomyVersion: data.version })
        .onConflictDoUpdate({ target: skillConcepts.id, set: { taxonomyUri: c.uri, taxonomyVersion: data.version } });
      for (const a of [c.name, ...c.aliases]) await tx.insert(skillAliases).values({ alias: normalizeSkill(a), conceptId: id }).onConflictDoNothing();
      added++;
    }
  });
  return { added };
}
