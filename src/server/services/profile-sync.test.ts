import { beforeAll, describe, expect, it } from "vitest";

import { createMemoryDb, type Db } from "../db/client";
import { upsertIdentity } from "../auth/identity";
import { educationLevelFrom, mapProjection, projectionSchema } from "../integrations/tathastu-profile";
import { applyTathastuProfile, fetchTathastuProfile, ProfileSyncError, recordSyncFailure } from "./profile-sync";
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
    expect(m.withheld).not.toContain("education"); // null without privacy.masked = unconfirmed, not withdrawn
    expect(m.unconfirmed).toContain("education");
    const masked = mapProjection(projectionSchema.parse(projection({ education: null, privacy: { scopes: { education: false }, masked: ["education"] } })));
    expect(masked.withheld).toEqual(["education"]);
    expect(masked.education).toEqual([]); // withheld → imported rows removed
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

  it("removes a section the student stopped sharing (null AND listed in privacy.masked, per contract)", async () => {
    await applyTathastuProfile(db, profileId, projection(), "ait-sub-1", actor);
    await applyTathastuProfile(db, profileId, projection({ education: null, privacy: { scopes: { education: false, skills: true }, masked: ["education"] } }), "ait-sub-1", actor);
    const p = (await loadProfile(db, profileId))!;
    expect(p.education.filter((e) => e.source === "ai_tathastu")).toHaveLength(0);
    expect(p.profile.aitSyncStatus).toBe("partial");
  });

  it("rejects a profile for a different subject", async () => {
    await expect(applyTathastuProfile(db, profileId, projection(), "someone-else", actor)).rejects.toBeInstanceOf(ProfileSyncError);
  });
});

describe("profile import safety (contract edge cases)", () => {
  it("never treats an unmarked null section as consent withdrawal: existing imported rows are kept", async () => {
    await applyTathastuProfile(db, profileId, projection(), "ait-sub-1", actor);
    const before = (await loadProfile(db, profileId))!.projects.filter((p) => p.source === "ai_tathastu").length;
    expect(before).toBeGreaterThan(0);
    const m = await applyTathastuProfile(db, profileId, projection({ projects: null, privacy: { scopes: { projects: true }, masked: [] } }), "ait-sub-1", actor);
    expect(m.unconfirmed).toEqual(["projects"]);
    const p = (await loadProfile(db, profileId))!;
    expect(p.projects.filter((x) => x.source === "ai_tathastu")).toHaveLength(before);
    expect(p.profile.aitSyncStatus).toBe("partial");
    expect(p.profile.aitSyncError).toMatch(/didn't confirm: projects/);
  });
  it("an empty shared section ([]) is a real update, distinct from withheld", async () => {
    await applyTathastuProfile(db, profileId, projection(), "ait-sub-1", actor);
    const m = await applyTathastuProfile(db, profileId, projection({ experience: [] }), "ait-sub-1", actor);
    expect(m.withheld).not.toContain("experience");
    expect((await loadProfile(db, profileId))!.experiences.filter((e) => e.source === "ai_tathastu")).toHaveLength(0);
  });
  it("rejects a profile issued for another app", async () => {
    await expect(applyTathastuProfile(db, profileId, projection({ audience: "collaborate" }), "ait-sub-1", actor, "avsar")).rejects.toMatchObject({ code: "AUDIENCE_MISMATCH" });
    await expect(applyTathastuProfile(db, profileId, projection({ audience: "avsar" }), "ait-sub-1", actor, "avsar")).resolves.toBeTruthy();
  });
  it("rejects a malformed profile without writing anything", async () => {
    await expect(applyTathastuProfile(db, profileId, { schema: "Other" }, "ait-sub-1", actor)).rejects.toMatchObject({ code: "INVALID_PROFILE" });
  });
});

describe("profile fetch errors", () => {
  const fetchWith = (res: Response | Error) => (async () => { if (res instanceof Error) throw res; return res; }) as unknown as typeof fetch;
  it("401 means disconnected; 403/429/503, timeouts and bad bodies are unavailable/invalid", async () => {
    await expect(fetchTathastuProfile("https://idp.test/p", "t", fetchWith(Response.json({ error: "invalid_token" }, { status: 401 })))).rejects.toMatchObject({ code: "DISCONNECTED" });
    for (const status of [403, 429, 503]) await expect(fetchTathastuProfile("https://idp.test/p", "t", fetchWith(Response.json({}, { status })))).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(fetchTathastuProfile("https://idp.test/p", "t", fetchWith(new DOMException("timeout", "TimeoutError") as unknown as Error))).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(fetchTathastuProfile("https://idp.test/p", "t", fetchWith(new Response("<html>", { status: 200 })))).rejects.toMatchObject({ code: "INVALID_PROFILE" });
  });
  it("records a failure without touching imported data, so sign-in can continue with a retry state", async () => {
    await applyTathastuProfile(db, profileId, projection(), "ait-sub-1", actor);
    const before = (await loadProfile(db, profileId))!.education.length;
    await recordSyncFailure(db, profileId, "Avsar is no longer connected to your AI Tathastu account.");
    const p = (await loadProfile(db, profileId))!;
    expect(p.profile.aitSyncStatus).toBe("failed");
    expect(p.education).toHaveLength(before);
  });
});

describe("intelligence-layer data from AI Tathastu", () => {
  it("maps AI Tathastu engine levels in order and leaves 'Not assessed' unknown", () => {
    const m = mapProjection(projectionSchema.parse(projection({
      skills: { items: ["Foundational", "Working", "Proficient", "Advanced", "Not assessed"].map((level, i) => ({ name: `S${i}`, category: null, verified: false, verificationStatus: null, proficiency: null, level })) },
    })));
    expect(m.skills!.map((s) => s.level)).toEqual(["beginner", "intermediate", "advanced", "expert", null]);
  });

  it("onboarding-only student (shape seen in production): education comes from the onboarding university", () => {
    const m = mapProjection(projectionSchema.parse(projection({
      identity: { id: "ait-sub-1", email: null, name: "Student", headline: null, avatarUrl: null, careerRole: { id: "ai", label: "AI Engineer" }, location: { city: "Phagwara", country: "India" }, university: "Lovely Professional University", degree: "B.Tech", specialization: "Computer Science", academicYear: "3rd year", expectedGraduationYear: 2027 },
      education: [], skills: { items: [] }, projects: [], experience: [], achievements: [],
      privacy: { scopes: { education: true, skills: true, projects: true, experience: true, achievements: true }, masked: [] },
    })));
    expect(m.education).toEqual([expect.objectContaining({ institution: "Lovely Professional University", level: "bachelors", field: "Computer Science", graduationYear: 2027 })]);
    expect(m.insights.academic).toEqual({ university: "Lovely Professional University", degree: "B.Tech", specialization: "Computer Science", academicYear: "3rd year", graduationYear: 2027 });
    expect(m.withheld).toEqual([]);
  });

  it("never invents education when education wasn't shared or nothing was entered", () => {
    const base = { id: "ait-sub-1", email: null, name: null, headline: null, avatarUrl: null, careerRole: null, location: null };
    const notShared = mapProjection(projectionSchema.parse(projection({ identity: { ...base, university: "LPU" }, education: null, privacy: { scopes: { education: false }, masked: ["education"] } })));
    expect(notShared.education).toEqual([]); // withheld → imported rows removed, nothing synthesised
    const nothing = mapProjection(projectionSchema.parse(projection({ identity: base, education: [] })));
    expect(nothing.education).toEqual([]);
  });

  it("keeps verified skills, readiness, goals and activity as insights; null when not shared", () => {
    const full = mapProjection(projectionSchema.parse(projection({
      skills: {
        items: [{ name: "Python", category: "language", evidenceStrength: 0.8, verified: true, verificationStatus: "verified", proficiency: 62.4, level: "Proficient" }],
        erisReadiness: { score: 0.63, role: "ml_engineer", byRole: { ml_engineer: 0.63 }, gaps: [{ skill: "PyTorch", readiness: 0.2, weight: 1 }], computedAt: null },
      },
      goals: { targetRole: { id: "ml_engineer", label: "ML Engineer" }, needs: [{ skill: "PyTorch", priority: "High", state: "missing", expectedLevel: "Working" }], assessed: true, collaborationIntents: [] },
      activity: { connectedSources: ["github"], github: { repositories: 7, recent: [{ name: "r", url: null, stars: 1, languages: ["Python", "Jupyter"], lastCommitAt: null }] }, profileUpdatedAt: null },
    })));
    expect(full.insights.skills).toEqual([{ name: "Python", verified: true, proficiency: 62, evidenceStrength: 0.8 }]);
    expect(full.insights.readiness).toEqual({ score: 63, gaps: [{ skill: "PyTorch", readiness: 0.2 }] });
    expect(full.insights.goals).toEqual({ targetRole: "ML Engineer", needs: [{ skill: "PyTorch", priority: "High", state: "missing" }], assessed: true });
    expect(full.insights.activity).toEqual({ connectedSources: ["github"], repositories: 7, languages: ["Python", "Jupyter"] });

    const bare = mapProjection(projectionSchema.parse(projection({ skills: null, privacy: { scopes: { skills: false }, masked: ["skills"] } })));
    expect(bare.insights).toMatchObject({ skills: null, readiness: null, goals: null, activity: null });
  });

  it("stores the insights on the profile at sync", async () => {
    await applyTathastuProfile(db, profileId, projection({ goals: { targetRole: { id: "fe", label: "Frontend Developer" }, needs: [], assessed: false } }), "ait-sub-1", actor);
    const p = (await loadProfile(db, profileId))!;
    expect(p.profile.aitInsights.goals).toEqual({ targetRole: "Frontend Developer", needs: [], assessed: false });
  });
});
