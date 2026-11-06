import { beforeAll, describe, expect, it } from "vitest";

import { createMemoryDb, type Db } from "../db/client";
import { upsertIdentity } from "../auth/identity";
import { educationLevelFrom, mapProjection, projectionSchema } from "../integrations/tathastu-profile";
import { applyTathastuProfile, ProfileSyncError } from "./profile-sync";
import { addSectionItem, ensureProfile, loadProfile, replaceSkills, updateProfileFields } from "./profiles";

/** Fixture shaped exactly like AI Tathastu's ProfessionalProjectionV1. */
const projection = (over: Record<string, unknown> = {}) => ({
  schema: "ProfessionalProjectionV1",
  version: 1,
  identity: { id: "ait-sub-1", email: "s@example.invalid", name: "Meera Iyer", headline: "CS student", avatarUrl: null, careerRole: { id: "fe", label: "Frontend Developer" }, location: { city: "Pune", country: "India" } },
  education: [{ institution: "COEP", degree: "B.Tech", fieldOfStudy: "Computer Science", dates: "2022 - 2026", grade: "8.4" }],
  skills: { items: [{ name: "React", category: null, verified: true, verificationStatus: null, proficiency: null, level: "advanced" }, { name: "SQL", category: null, verified: false, verificationStatus: null, proficiency: null, level: null }] },
  projects: [{ key: "p1", title: "Campus app", description: "Built it", technologies: ["React"], links: ["https://example.com"] }],
  experience: [{ organization: "Acme", role: "Intern", dates: "Jun 2025 - Aug 2025", description: null }],
  achievements: [{ type: "certification", title: "AWS CP", issuer: "AWS", date: "2025", url: null }, { type: "publication", title: "Paper", issuer: null, date: null, url: null }],
  privacy: { scopes: { education: true, skills: true }, masked: [] },
  ...over,
});

let db: Db;
let profileId: string;
let actor: string;

beforeAll(async () => {
  db = await createMemoryDb();
  const id = await upsertIdentity(db, { provider: "ai_tathastu", subject: "ait-sub-1", email: null, emailVerified: false, name: null });
  actor = id.id;
  profileId = (await ensureProfile(db, id.id, null))!.id;
});

describe("projection mapping", () => {
  it("maps without inventing values", () => {
    const m = mapProjection(projectionSchema.parse(projection({ education: null })));
    expect(m.education).toBeNull();
    expect(m.withheld).toContain("education");
    expect(m.certifications?.[0].name).toBe("AWS CP");
    expect(m.achievements?.[0].kind).toBe("publication");
  });
  it("derives education level only when clearly stated", () => {
    expect(educationLevelFrom("B.Tech")).toBe("bachelors");
    expect(educationLevelFrom("Something vague")).toBeNull();
  });
});

describe("profile sync", () => {
  it("imports and is idempotent", async () => {
    await applyTathastuProfile(db, profileId, projection(), "ait-sub-1", actor);
    await applyTathastuProfile(db, profileId, projection(), "ait-sub-1", actor);
    const p = (await loadProfile(db, profileId))!;
    expect(p.profile.fullName).toBe("Meera Iyer");
    expect(p.education).toHaveLength(1);
    expect(p.skills.filter((s) => s.source === "ai_tathastu")).toHaveLength(2);
    expect(p.projects).toHaveLength(1);
    expect(p.profile.aitSyncStatus).toBe("ok");
  });

  it("never touches Avsar-owned rows and lets student edits win", async () => {
    await addSectionItem(db, profileId, "project", { title: "My own project", skills: [] });
    await replaceSkills(db, profileId, ["React", "Figma"]);
    await updateProfileFields(db, profileId, { headline: "My own headline" });
    await applyTathastuProfile(db, profileId, projection(), "ait-sub-1", actor);
    const p = (await loadProfile(db, profileId))!;
    expect(p.projects.map((x) => x.title)).toContain("My own project");
    expect(p.profile.headline).toBe("My own headline");
    expect(p.skills.filter((s) => s.normalized === "react")).toHaveLength(1);
  });

  it("removes a section the student stopped sharing", async () => {
    await applyTathastuProfile(db, profileId, projection({ education: null }), "ait-sub-1", actor);
    const p = (await loadProfile(db, profileId))!;
    expect(p.education.filter((e) => e.source === "ai_tathastu")).toHaveLength(0);
    expect(p.profile.aitSyncStatus).toBe("partial");
  });

  it("rejects a profile for a different subject", async () => {
    await expect(applyTathastuProfile(db, profileId, projection(), "someone-else", actor)).rejects.toBeInstanceOf(ProfileSyncError);
  });
});
