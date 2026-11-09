/**
 * Inserts SAMPLE data (idempotent by slug). Used by `npm run db:seed` and by tests.
 * Never run against production: refuses when NODE_ENV=production.
 */
import { mergeQuestions } from "./domain/categories";
import { eq } from "drizzle-orm";

import type { Db } from "./db/client";
import { opportunities, opportunityEligibility, opportunitySkills, opportunitySources } from "./db/schema";
import { SAMPLE_OPPORTUNITIES, sampleSkillRows, slugFor } from "./seed-data";

export async function seedSamples(db: Db, now = new Date()) {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed sample data in production.");
  let [source] = await db.select().from(opportunitySources).where(eq(opportunitySources.name, "Avsar manual curation"));
  source ??= (await db.insert(opportunitySources).values({ name: "Avsar manual curation", kind: "manual", termsNote: "Listings entered by Avsar administrators." }).returning())[0];
  let inserted = 0;
  for (const [i, s] of SAMPLE_OPPORTUNITIES.entries()) {
    const slug = slugFor(s, i);
    const [exists] = await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.slug, slug));
    if (exists) continue;
    const publishedAt = new Date(now.getTime() - (i + 1) * 3_600_000);
    const [row] = await db.insert(opportunities).values({
      slug, title: s.title, category: s.category, employmentType: s.employmentType ?? null, organizationName: s.organizationName,
      summary: s.summary, description: s.description, responsibilities: s.responsibilities, workMode: s.workMode, locations: s.locations,
      compMin: s.compMin ?? null, compMax: s.compMax ?? null, compPeriod: s.compPeriod ?? null, unpaid: s.unpaid ?? false,
      durationWeeks: s.durationWeeks ?? null, experienceMinYears: s.experienceMinYears ?? null,
      deadline: new Date(now.getTime() + s.deadlineInDays * 86_400_000), applicationMethod: s.applicationMethod, externalUrl: s.externalUrl ?? null,
      details: s.details ?? {}, questions: mergeQuestions(s.category, s.questions ?? []), status: "published", verification: s.verification ?? "unverified",
      sourceId: source.id, sourceProvider: source.name, isSample: true, publishedAt, lastVerifiedAt: publishedAt,
    }).returning();
    const skillRows = sampleSkillRows(row.id, s);
    if (skillRows.length) await db.insert(opportunitySkills).values(skillRows);
    await db.insert(opportunityEligibility).values({
      opportunityId: row.id, educationLevels: s.educationLevels ?? null, graduationYearMin: s.graduationYearMin ?? null,
      graduationYearMax: s.graduationYearMax ?? null, minExperienceYears: s.experienceMinYears ?? null,
      requiresWorkAuthorizationIndia: s.requiresWorkAuthorizationIndia ?? false,
    });
    inserted++;
  }
  return { inserted, sourceId: source.id };
}
