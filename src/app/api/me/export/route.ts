import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { notifications, savedOpportunities, savedSearches } from "@/server/db/schema";
import { apiError } from "@/server/http";
import { listApplicationsForProfile } from "@/server/services/applications";
import { loadProfile } from "@/server/services/profiles";

/** GET /api/me/export — everything Avsar holds about the signed-in person (no internal secrets or storage keys). */
export async function GET() {
  const session = await getSession();
  if (!session) return apiError(401, "UNAUTHENTICATED", "Sign in to export your data");
  const db = await getDb();
  const profile = session.profileId ? await loadProfile(db, session.profileId) : null;
  const [apps, saved, searches, notes] = await Promise.all([
    session.profileId ? listApplicationsForProfile(db, session.profileId) : [],
    db.select().from(savedOpportunities).where(eq(savedOpportunities.identityId, session.identity.id)),
    db.select().from(savedSearches).where(eq(savedSearches.identityId, session.identity.id)),
    db.select().from(notifications).where(eq(notifications.identityId, session.identity.id)),
  ]);
  const body = {
    exportedAt: new Date().toISOString(),
    identity: { provider: session.identity.provider, email: session.identity.email, name: session.identity.name, createdAt: session.identity.createdAt },
    profile: profile && {
      ...profile.profile,
      education: profile.education,
      experiences: profile.experiences,
      projects: profile.projects,
      certifications: profile.certifications,
      skills: profile.skills.map(({ name, level, years, evidenceCount }) => ({ name, level, years, evidenceCount })),
      resumes: profile.resumes.map(({ resume, doc }) => ({ label: resume.label, version: resume.version, isDefault: resume.isDefault, fileName: doc.originalName, sizeBytes: doc.sizeBytes, uploadedAt: doc.createdAt })),
    },
    applications: apps.map(({ application, opportunity }) => ({ opportunity: opportunity.title, organization: opportunity.organizationName, status: application.status, submittedAt: application.submittedAt, snapshot: application.profileSnapshot })),
    savedOpportunities: saved.map((s) => ({ opportunityId: s.opportunityId, savedAt: s.createdAt })),
    savedSearches: searches.map(({ name, query, createdAt }) => ({ name, query, createdAt })),
    notifications: notes.map(({ title, body, createdAt, readAt }) => ({ title, body, createdAt, readAt })),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="avsar-my-data.json"', "cache-control": "private, no-store" },
  });
}
