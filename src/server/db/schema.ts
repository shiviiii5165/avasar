/**
 * Avsar data model (PostgreSQL). One schema, owned by Avsar only: no table here is shared with
 * AI Tathastu or Collaborate. Documented in docs/DATA_MODEL.md. Change it only through
 * migrations (npm run db:generate), never by hand in a live database.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
/** Where a profile record came from. 'ai_tathastu' rows are replaced on each sync; 'avsar' rows are the student's own and never touched by sync. */
const provenance = () => ({
  source: text("source").$type<"avsar" | "ai_tathastu">().notNull().default("avsar"),
  sourceKey: text("source_key"),
});

// ─── Enums ─────────────────────────────────────────────────────────────────
export const identityProvider = pgEnum("identity_provider", ["ai_tathastu", "dev"]);
export const adminRole = pgEnum("admin_role", ["super_admin", "platform_admin", "verification_officer", "moderator", "support_agent", "analytics_admin"]);
export const profileVisibility = pgEnum("profile_visibility", ["private", "application", "discoverable"]);
export const careerStage = pgEnum("career_stage", ["student", "fresher", "early_career", "experienced", "career_switcher"]);
export const educationLevel = pgEnum("education_level", ["secondary", "higher_secondary", "diploma", "bachelors", "masters", "doctorate"]);
export const skillLevel = pgEnum("skill_level", ["beginner", "intermediate", "advanced", "expert"]);
export const workMode = pgEnum("work_mode", ["remote", "hybrid", "onsite"]);
export const opportunityCategory = pgEnum("opportunity_category", [
  "job", "internship", "gig",
  // Extensible categories (later releases). Each has its own fields in `details` and its own flow.
  "hackathon", "competition", "scholarship", "fellowship", "research", "entrepreneurship", "startup_program",
  "academic_project", "professional_project",
]);
export const employmentType = pgEnum("employment_type", ["full_time", "part_time", "temporary", "contract"]);
export const opportunityStatus = pgEnum("opportunity_status", ["draft", "imported", "in_review", "approved", "published", "paused", "closed", "expired", "rejected", "suspended"]);
export const verificationLevel = pgEnum("verification_level", ["unverified", "source_verified", "org_verified"]);
export const applicationMethod = pgEnum("application_method", ["internal", "external"]);
export const applicationStatus = pgEnum("application_status", ["draft", "submitted", "viewed", "under_review", "shortlisted", "assessment", "interview", "offered", "selected", "rejected", "withdrawn", "closed"]);
export const orgVerificationStatus = pgEnum("org_verification_status", ["unverified", "pending", "under_review", "verified", "rejected", "suspended", "expired"]);
export const orgMemberRole = pgEnum("org_member_role", ["owner", "recruiter", "hiring_manager", "viewer"]);
export const reportReason = pgEnum("report_reason", ["fake_opportunity", "fake_organization", "suspicious_link", "misleading_compensation", "payment_demand", "discriminatory", "harassment", "spam", "impersonation", "other"]);
export const caseStatus = pgEnum("case_status", ["open", "in_review", "actioned", "dismissed", "escalated", "appealed"]);
export const caseSeverity = pgEnum("case_severity", ["low", "medium", "high", "critical"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed", "dead"]);
export const documentKind = pgEnum("document_kind", ["resume", "attachment", "verification_evidence"]);

// ─── Identity & sessions ───────────────────────────────────────────────────
/** A person as known to the identity provider. No passwords: Avsar never stores external credentials. */
export const userIdentities = pgTable("user_identities", {
  id: id(),
  provider: identityProvider("provider").notNull(),
  subject: text("subject").notNull(),
  email: text("email"),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("user_identities_provider_subject").on(t.provider, t.subject)]);

/** Avsar's own application sessions. Only a SHA-256 of the cookie token is stored. */
export const sessions = pgTable("sessions", {
  id: id(),
  identityId: uuid("identity_id").notNull().references(() => userIdentities.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [uniqueIndex("sessions_token_hash").on(t.tokenHash), index("sessions_identity").on(t.identityId)]);

/** Pending OAuth flows (state → PKCE verifier, nonce, return path). Short-lived, single use. */
export const oauthFlows = pgTable("oauth_flows", {
  state: text("state").primaryKey(),
  codeVerifier: text("code_verifier").notNull(),
  nonce: text("nonce").notNull(),
  returnTo: text("return_to").notNull().default("/app"),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const adminRoles = pgTable("admin_roles", {
  identityId: uuid("identity_id").notNull().references(() => userIdentities.id, { onDelete: "cascade" }),
  role: adminRole("role").notNull(),
  grantedBy: uuid("granted_by").references(() => userIdentities.id),
  grantedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.identityId, t.role] })]);

// ─── Candidate profile ─────────────────────────────────────────────────────
export const candidateProfiles = pgTable("candidate_profiles", {
  id: id(),
  identityId: uuid("identity_id").notNull().references(() => userIdentities.id, { onDelete: "cascade" }),
  fullName: text("full_name"),
  headline: text("headline"),
  bio: text("bio"),
  city: text("city"),
  region: text("region"),
  country: text("country").default("India"),
  careerStage: careerStage("career_stage"),
  /** Privacy by default: private until the candidate chooses otherwise. */
  visibility: profileVisibility("visibility").notNull().default("private"),
  preferredRoles: text("preferred_roles").array().notNull().default(sql`'{}'::text[]`),
  preferredLocations: text("preferred_locations").array().notNull().default(sql`'{}'::text[]`),
  preferredCategories: text("preferred_categories").array().notNull().default(sql`'{}'::text[]`),
  workModes: text("work_modes").array().notNull().default(sql`'{}'::text[]`),
  interests: text("interests").array().notNull().default(sql`'{}'::text[]`),
  expectedCompMin: integer("expected_comp_min"),
  compCurrency: text("comp_currency").default("INR"),
  compPeriod: text("comp_period"),
  availableFrom: date("available_from"),
  hoursPerWeek: integer("hours_per_week"),
  workAuthorizedIndia: boolean("work_authorized_india"),
  linkedinUrl: text("linkedin_url"),
  githubUrl: text("github_url"),
  portfolioUrl: text("portfolio_url"),
  /** Avsar-owned answer to an in-context question (e.g. an opportunity needed it and AI Tathastu didn't supply it). */
  graduationYear: integer("graduation_year"),
  /** Avsar-owned answer to an education requirement, given in an application when the import has no level. */
  educationLevel: text("education_level"),
  // ── AI Tathastu profile sync (source-owned data lives in the section tables with source = 'ai_tathastu') ──
  aitSyncedAt: timestamp("ait_synced_at", { withTimezone: true }),
  aitSyncStatus: text("ait_sync_status").$type<"never" | "ok" | "partial" | "failed">().notNull().default("never"),
  aitSyncError: text("ait_sync_error"),
  /** Sections the student chose to share with Avsar on AI Tathastu's consent screen (privacy.scopes). */
  aitScopes: jsonb("ait_scopes").$type<Record<string, boolean>>().notNull().default({}),
  /** Identity fields last written by the import; a field the student has since edited in Avsar is no longer listed (Avsar edit wins). */
  importedFields: jsonb("imported_fields").$type<Record<string, string>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("candidate_profiles_identity").on(t.identityId)]);

export const education = pgTable("education", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => candidateProfiles.id, { onDelete: "cascade" }),
  ...provenance(),
  institution: text("institution").notNull(),
  /** Null when the source degree text doesn't clearly state a level (never guessed). */
  level: educationLevel("level"),
  degree: text("degree"),
  field: text("field"),
  startYear: integer("start_year"),
  graduationYear: integer("graduation_year"),
  grade: text("grade"),
  createdAt: createdAt(),
}, (t) => [index("education_profile").on(t.profileId)]);

export const experiences = pgTable("experiences", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => candidateProfiles.id, { onDelete: "cascade" }),
  ...provenance(),
  organization: text("organization").notNull(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("full_time"), // full_time | part_time | internship | freelance | volunteer
  startDate: date("start_date"),
  endDate: date("end_date"),
  current: boolean("current").notNull().default(false),
  description: text("description"),
  createdAt: createdAt(),
}, (t) => [index("experiences_profile").on(t.profileId)]);

export const projects = pgTable("projects", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => candidateProfiles.id, { onDelete: "cascade" }),
  ...provenance(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
}, (t) => [index("projects_profile").on(t.profileId)]);

export const certifications = pgTable("certifications", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => candidateProfiles.id, { onDelete: "cascade" }),
  ...provenance(),
  name: text("name").notNull(),
  issuer: text("issuer"),
  issuedOn: date("issued_on"),
  url: text("url"),
  createdAt: createdAt(),
}, (t) => [index("certifications_profile").on(t.profileId)]);

/** Awards, publications and other achievements (AI Tathastu "achievements" that aren't certifications). */
export const achievements = pgTable("achievements", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => candidateProfiles.id, { onDelete: "cascade" }),
  ...provenance(),
  kind: text("kind").notNull(), // achievement | publication
  title: text("title").notNull(),
  issuer: text("issuer"),
  date: text("date"),
  url: text("url"),
  createdAt: createdAt(),
}, (t) => [index("achievements_profile").on(t.profileId)]);

export const candidateSkills = pgTable("candidate_skills", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => candidateProfiles.id, { onDelete: "cascade" }),
  ...provenance(),
  name: text("name").notNull(),
  normalized: text("normalized").notNull(),
  level: skillLevel("level"),
  years: integer("years"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("candidate_skills_unique").on(t.profileId, t.normalized)]);

/** What backs a skill: a project, a role, a certificate or a link. Evidence strength comes from here. */
export const skillEvidence = pgTable("skill_evidence", {
  id: id(),
  skillId: uuid("skill_id").notNull().references(() => candidateSkills.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // project | experience | certification | link
  refId: uuid("ref_id"),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [index("skill_evidence_skill").on(t.skillId)]);

// ─── Documents ─────────────────────────────────────────────────────────────
/** Private files. Bytes live in object storage under storageKey; never served without a signed, short-lived URL. */
export const documents = pgTable("documents", {
  id: id(),
  ownerIdentityId: uuid("owner_identity_id").notNull().references(() => userIdentities.id, { onDelete: "cascade" }),
  kind: documentKind("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: createdAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("documents_owner").on(t.ownerIdentityId)]);

export const resumes = pgTable("resumes", {
  id: id(),
  profileId: uuid("profile_id").notNull().references(() => candidateProfiles.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  label: text("label").notNull(),
  version: integer("version").notNull().default(1),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("resumes_profile").on(t.profileId)]);

export const documentAccessLog = pgTable("document_access_log", {
  id: id(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  actorIdentityId: uuid("actor_identity_id").references(() => userIdentities.id),
  action: text("action").notNull(), // upload | view | delete | attach
  at: createdAt(),
});

// ─── Organizations ─────────────────────────────────────────────────────────
export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  website: text("website"),
  domain: text("domain"),
  description: text("description"),
  industry: text("industry"),
  city: text("city"),
  createdBy: uuid("created_by").references(() => userIdentities.id),
  verificationStatus: orgVerificationStatus("verification_status").notNull().default("unverified"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("organizations_slug").on(t.slug)]);

export const organizationMembers = pgTable("organization_members", {
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  identityId: uuid("identity_id").notNull().references(() => userIdentities.id, { onDelete: "cascade" }),
  role: orgMemberRole("role").notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.orgId, t.identityId] })]);

export const organizationInvitations = pgTable("organization_invitations", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: orgMemberRole("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  /** Accepted by whoever presented the token while signed in. Never matched by email. */
  acceptedBy: uuid("accepted_by").references(() => userIdentities.id),
  invitedBy: uuid("invited_by").references(() => userIdentities.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("organization_invitations_token").on(t.tokenHash)]);

export const verificationRequests = pgTable("verification_requests", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  status: orgVerificationStatus("status").notNull().default("pending"),
  submittedBy: uuid("submitted_by").references(() => userIdentities.id),
  reviewedBy: uuid("reviewed_by").references(() => userIdentities.id),
  decisionNote: text("decision_note"),
  createdAt: createdAt(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const verificationEvidence = pgTable("verification_evidence", {
  id: id(),
  requestId: uuid("request_id").notNull().references(() => verificationRequests.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // domain | website | registration | representative | document
  value: text("value"),
  documentId: uuid("document_id").references(() => documents.id),
  createdAt: createdAt(),
});

// ─── Opportunities ─────────────────────────────────────────────────────────
export const opportunitySources = pgTable("opportunity_sources", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // manual | feed | api
  url: text("url"),
  termsNote: text("terms_note"), // how we're allowed to use it (no scraping against terms)
  active: boolean("active").notNull().default(true),
  lastImportAt: timestamp("last_import_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const opportunities = pgTable("opportunities", {
  id: id(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  category: opportunityCategory("category").notNull(),
  employmentType: employmentType("employment_type"),
  orgId: uuid("org_id").references(() => organizations.id),
  organizationName: text("organization_name").notNull(),
  summary: text("summary"),
  description: text("description").notNull(),
  responsibilities: text("responsibilities"),
  workMode: workMode("work_mode").notNull(),
  locations: text("locations").array().notNull().default(sql`'{}'::text[]`),
  country: text("country").notNull().default("India"),
  compMin: integer("comp_min"),
  compMax: integer("comp_max"),
  compCurrency: text("comp_currency").notNull().default("INR"),
  compPeriod: text("comp_period"), // year | month | project | total
  unpaid: boolean("unpaid").notNull().default(false),
  durationWeeks: integer("duration_weeks"),
  experienceMinYears: integer("experience_min_years"),
  experienceMaxYears: integer("experience_max_years"),
  deadline: timestamp("deadline", { withTimezone: true }),
  startDate: date("start_date"),
  applicationMethod: applicationMethod("application_method").notNull().default("internal"),
  externalUrl: text("external_url"),
  /** Category-specific fields (stipend, conversion, deliverables, prize, ...). Validated per category. */
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  /** Questions for Avsar-hosted applications. */
  questions: jsonb("questions").$type<{ key: string; label: string; required: boolean }[]>().notNull().default([]),
  status: opportunityStatus("status").notNull().default("draft"),
  verification: verificationLevel("verification").notNull().default("unverified"),
  sourceId: uuid("source_id").references(() => opportunitySources.id),
  sourceUrl: text("source_url"),
  sourceProvider: text("source_provider"),
  importedAt: timestamp("imported_at", { withTimezone: true }),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  /** Seeded demonstration data: always labelled in the UI, never counted in metrics. */
  isSample: boolean("is_sample").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdBy: uuid("created_by").references(() => userIdentities.id),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("opportunities_slug").on(t.slug),
  index("opportunities_status_deadline").on(t.status, t.deadline),
  index("opportunities_category").on(t.category),
]);

export const opportunitySkills = pgTable("opportunity_skills", {
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  normalized: text("normalized").notNull(),
  required: boolean("required").notNull().default(true),
}, (t) => [primaryKey({ columns: [t.opportunityId, t.normalized] })]);

/** Hard requirements. Null = no requirement. Checked by the eligibility engine, never by match score. */
export const opportunityEligibility = pgTable("opportunity_eligibility", {
  opportunityId: uuid("opportunity_id").primaryKey().references(() => opportunities.id, { onDelete: "cascade" }),
  educationLevels: text("education_levels").array(),
  graduationYearMin: integer("graduation_year_min"),
  graduationYearMax: integer("graduation_year_max"),
  minExperienceYears: integer("min_experience_years"),
  requiredCertifications: text("required_certifications").array(),
  allowedLocations: text("allowed_locations").array(),
  requiresWorkAuthorizationIndia: boolean("requires_work_authorization_india").notNull().default(false),
  notes: text("notes"),
});

export const opportunityVersions = pgTable("opportunity_versions", {
  id: id(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  changedBy: uuid("changed_by").references(() => userIdentities.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("opportunity_versions_unique").on(t.opportunityId, t.version)]);

/** One row per imported item: raw payload, normalized form, dedupe key and validation issues. */
export const importRecords = pgTable("import_records", {
  id: id(),
  sourceId: uuid("source_id").notNull().references(() => opportunitySources.id),
  rawPayload: jsonb("raw_payload").notNull(),
  normalized: jsonb("normalized"),
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").notNull(), // invalid | duplicate | queued | approved | rejected
  issues: text("issues").array().notNull().default(sql`'{}'::text[]`),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  createdAt: createdAt(),
}, (t) => [index("import_records_dedupe").on(t.dedupeKey)]);

export const savedOpportunities = pgTable("saved_opportunities", {
  identityId: uuid("identity_id").notNull().references(() => userIdentities.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.identityId, t.opportunityId] })]);

export const savedSearches = pgTable("saved_searches", {
  id: id(),
  identityId: uuid("identity_id").notNull().references(() => userIdentities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  query: jsonb("query").$type<Record<string, string>>().notNull(),
  createdAt: createdAt(),
});

export const recentlyViewed = pgTable("recently_viewed", {
  identityId: uuid("identity_id").notNull().references(() => userIdentities.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.identityId, t.opportunityId] })]);

// ─── Applications ──────────────────────────────────────────────────────────
export const applications = pgTable("applications", {
  id: id(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id),
  profileId: uuid("profile_id").notNull().references(() => candidateProfiles.id),
  status: applicationStatus("status").notNull().default("submitted"),
  /** Snapshots: what the candidate actually submitted, unaffected by later edits. */
  opportunityVersion: integer("opportunity_version").notNull(),
  resumeDocumentId: uuid("resume_document_id").references(() => documents.id),
  profileSnapshot: jsonb("profile_snapshot").notNull(),
  consentText: text("consent_text").notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("applications_one_per_candidate").on(t.opportunityId, t.profileId),
  uniqueIndex("applications_idempotency").on(t.idempotencyKey),
  index("applications_profile").on(t.profileId),
]);

export const applicationAnswers = pgTable("application_answers", {
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  questionKey: text("question_key").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
}, (t) => [primaryKey({ columns: [t.applicationId, t.questionKey] })]);

export const applicationEvents = pgTable("application_events", {
  id: id(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  fromStatus: applicationStatus("from_status"),
  toStatus: applicationStatus("to_status").notNull(),
  actorIdentityId: uuid("actor_identity_id").references(() => userIdentities.id),
  actorRole: text("actor_role").notNull(), // candidate | admin | employer | system
  reason: text("reason"),
  at: createdAt(),
}, (t) => [index("application_events_app").on(t.applicationId)]);

/** Employer workspace entities (Release 6, gated). Present so the domain is complete. */
export const assessments = pgTable("assessments", {
  id: id(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  instructions: text("instructions"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  result: text("result"),
  score: integer("score"),
  maxScore: integer("max_score"),
  feedback: text("feedback"),
  createdBy: uuid("created_by").references(() => userIdentities.id),
  createdAt: createdAt(),
});
export const interviews = pgTable("interviews", {
  id: id(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),
  mode: text("mode"), // video | phone | onsite
  location: text("location"), // meeting link or address
  interviewers: text("interviewers"),
  status: text("status").notNull().default("scheduled"), // scheduled | completed | cancelled
  outcome: text("outcome"), // advance | hold | decline (a person's recommendation, never automated)
  feedback: text("feedback"),
  createdBy: uuid("created_by").references(() => userIdentities.id),
  createdAt: createdAt(),
});
export const internalNotes = pgTable("internal_notes", {
  id: id(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  authorIdentityId: uuid("author_identity_id").notNull().references(() => userIdentities.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
});
export const messages = pgTable("messages", {
  id: id(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  senderIdentityId: uuid("sender_identity_id").notNull().references(() => userIdentities.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

// ─── Notifications ─────────────────────────────────────────────────────────
export const notifications = pgTable("notifications", {
  id: id(),
  identityId: uuid("identity_id").notNull().references(() => userIdentities.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  /** Same event never notifies twice. */
  dedupeKey: text("dedupe_key").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("notifications_dedupe").on(t.dedupeKey), index("notifications_identity").on(t.identityId)]);

export const notificationPreferences = pgTable("notification_preferences", {
  identityId: uuid("identity_id").notNull().references(() => userIdentities.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  inApp: boolean("in_app").notNull().default(true),
  email: boolean("email").notNull().default(true),
}, (t) => [primaryKey({ columns: [t.identityId, t.kind] })]);

// ─── Trust & safety ────────────────────────────────────────────────────────
export const opportunityReports = pgTable("opportunity_reports", {
  id: id(),
  reporterIdentityId: uuid("reporter_identity_id").references(() => userIdentities.id),
  targetType: text("target_type").notNull(), // opportunity | organization
  targetId: uuid("target_id").notNull(),
  reason: reportReason("reason").notNull(),
  details: text("details"),
  createdAt: createdAt(),
}, (t) => [index("opportunity_reports_target").on(t.targetType, t.targetId)]);

export const moderationCases = pgTable("moderation_cases", {
  id: id(),
  reportId: uuid("report_id").references(() => opportunityReports.id),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  severity: caseSeverity("severity").notNull(),
  status: caseStatus("status").notNull().default("open"),
  action: text("action"), // none | request_correction | hide | reject | suspend_opportunity | suspend_org | restrict_account | escalate
  assignedTo: uuid("assigned_to").references(() => userIdentities.id),
  resolutionNote: text("resolution_note"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const supportTickets = pgTable("support_tickets", {
  id: id(),
  identityId: uuid("identity_id").references(() => userIdentities.id),
  email: text("email"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: createdAt(),
});

/** Append-only record of every sensitive action. */
export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorIdentityId: uuid("actor_identity_id").references(() => userIdentities.id),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  at: createdAt(),
}, (t) => [index("audit_logs_target").on(t.targetType, t.targetId), index("audit_logs_at").on(t.at)]);

export const analyticsEvents = pgTable("analytics_events", {
  id: id(),
  name: text("name").notNull(),
  identityId: uuid("identity_id").references(() => userIdentities.id, { onDelete: "set null" }),
  props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
  at: createdAt(),
}, (t) => [index("analytics_events_name_at").on(t.name, t.at)]);

// ─── Background jobs ───────────────────────────────────────────────────────
export const jobs = pgTable("jobs", {
  id: id(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: jobStatus("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lastError: text("last_error"),
  idempotencyKey: text("idempotency_key"),
  createdAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [uniqueIndex("jobs_idempotency").on(t.idempotencyKey), index("jobs_claim").on(t.status, t.runAt)]);
