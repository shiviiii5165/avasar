import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createMemoryDb, type Db } from "../db/client";
import { applicationAnswers, opportunities } from "../db/schema";
import { upsertIdentity } from "../auth/identity";
import { matchOpportunity } from "../domain/matching";
import { requirementQuestions } from "../domain/requirements";
import { seedSamples } from "../seed";
import { ApplyError, submitApplication } from "./applications";
import { getOpportunityBySlug, toFacts } from "./opportunities";
import { ensureProfile, loadProfile, toCandidateFacts } from "./profiles";

let db: Db;
let identityId: string;
let profileId: string;
let slug: string;

beforeAll(async () => {
  db = await createMemoryDb();
  await seedSamples(db);
  identityId = (await upsertIdentity(db, { provider: "ai_tathastu", subject: "ans-1", email: null, emailVerified: false, name: "Ravi" })).id;
  profileId = (await ensureProfile(db, identityId, "Ravi"))!.id; // nothing imported: every requirement is unknown
  slug = (await db.select().from(opportunities).where(eq(opportunities.title, "Frontend Developer Intern")))[0].slug;
});

const required = async () => {
  const o = (await getOpportunityBySlug(db, slug))!;
  const p = (await loadProfile(db, profileId))!;
  return { o, p, keys: requirementQuestions(matchOpportunity(toCandidateFacts(p), toFacts(o)).eligibility) };
};

describe("contextual requirement answers", () => {
  it("computes only the unknown mandatory requirements", async () => {
    expect((await required()).keys.sort()).toEqual(["education", "graduation_year", "work_authorization"]);
  });

  it("rejects a submission that leaves a required answer blank", async () => {
    const { o, p, keys } = await required();
    await expect(submitApplication(db, p, identityId, { opportunityId: o.id, resumeId: null, answers: { motivation: "Keen to learn" }, consent: true, idempotencyKey: "ans-k1", requiredKeys: keys, requirementAnswers: { educationLevel: "bachelors" } }))
      .rejects.toBeInstanceOf(ApplyError);
  });

  it("records confirmed answers in the snapshot, saves them only on opt-in, and blocks duplicates", async () => {
    const { o, p, keys } = await required();
    const { application } = await submitApplication(db, p, identityId, {
      opportunityId: o.id, resumeId: null, answers: { motivation: "Keen to learn" }, consent: true, idempotencyKey: "ans-k2",
      requiredKeys: keys, requirementAnswers: { educationLevel: "bachelors", graduationYear: 2026, workAuthorizedIndia: true }, saveAnswersToProfile: true,
    });
    const snap = application.profileSnapshot as { requirementAnswers: { key: string; answer: string }[] };
    expect(snap.requirementAnswers.map((a) => a.answer).sort()).toEqual(["2026", "Bachelor's degree", "Yes"]);
    const rows = await db.select().from(applicationAnswers).where(eq(applicationAnswers.applicationId, application.id));
    expect(rows.map((r) => r.questionKey).sort()).toEqual(["motivation", "requirement:education", "requirement:graduation_year", "requirement:work_authorization"]);

    // Saved to Avsar-owned profile fields, so the next application doesn't ask again.
    const after = await required();
    expect(after.p.profile.educationLevel).toBe("bachelors");
    expect(after.p.education).toHaveLength(0); // no imported/section record was invented or changed
    expect(after.keys).toEqual([]);

    await expect(submitApplication(db, after.p, identityId, { opportunityId: o.id, resumeId: null, answers: { motivation: "Again" }, consent: true, idempotencyKey: "ans-k3" }))
      .rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("does not touch the profile when the candidate declines to save", async () => {
    const other = (await upsertIdentity(db, { provider: "ai_tathastu", subject: "ans-2", email: null, emailVerified: false, name: "Sana" })).id;
    const pid = (await ensureProfile(db, other, "Sana"))!.id;
    const o = (await getOpportunityBySlug(db, slug))!;
    const p = (await loadProfile(db, pid))!;
    const keys = requirementQuestions(matchOpportunity(toCandidateFacts(p), toFacts(o)).eligibility);
    await submitApplication(db, p, other, { opportunityId: o.id, resumeId: null, answers: { motivation: "Hi" }, consent: true, idempotencyKey: "ans-k4", requiredKeys: keys, requirementAnswers: { educationLevel: "diploma", graduationYear: 2027, workAuthorizedIndia: true }, saveAnswersToProfile: false });
    const after = (await loadProfile(db, pid))!.profile;
    expect([after.educationLevel, after.graduationYear, after.workAuthorizedIndia]).toEqual([null, null, null]);
  });
});
