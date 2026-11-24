ALTER TYPE "public"."opportunity_category" ADD VALUE 'apprenticeship';--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"collected" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"unchanged" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"marked_stale" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "learning_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"kind" text NOT NULL,
	"skill_name" text NOT NULL,
	"concept_id" text,
	"title" text,
	"score" integer,
	"max_score" integer,
	"verified" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"included_in_profile" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_source_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_record_id" text NOT NULL,
	"source_url" text,
	"content_fingerprint" text,
	"matched_by" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"missing_since" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "role_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"taxonomy_source" text DEFAULT 'avsar' NOT NULL,
	"taxonomy_uri" text,
	"taxonomy_version" text
);
--> statement-breakpoint
CREATE TABLE "role_skills" (
	"role_id" text NOT NULL,
	"concept_id" text NOT NULL,
	"importance" text NOT NULL,
	CONSTRAINT "role_skills_role_id_concept_id_pk" PRIMARY KEY("role_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "skill_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"concept_id" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_concepts" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"category" text NOT NULL,
	"parent_id" text,
	"taxonomy_source" text DEFAULT 'avsar' NOT NULL,
	"taxonomy_uri" text,
	"taxonomy_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_relations" (
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "skill_relations_from_id_to_id_kind_pk" PRIMARY KEY("from_id","to_id","kind")
);
--> statement-breakpoint
CREATE TABLE "verification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"evidence_kind" text NOT NULL,
	"evidence" text,
	"reason" text,
	"reviewer_identity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "excluded_evidence_types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "verification_state" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "source_record_id" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "content_fingerprint" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "posted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "first_collected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "stale_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "education_requirement_text" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "eligibility_text" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "content_flags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunity_skills" ADD COLUMN "origin" text DEFAULT 'listed' NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunity_skills" ADD COLUMN "concept_id" text;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "adapter_key" text;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "permission_status" text DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "permission_evidence" text;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "permission_reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "permission_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "authority" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "last_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "next_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "last_success_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "last_failure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_id_opportunity_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."opportunity_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_source_refs" ADD CONSTRAINT "opportunity_source_refs_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_source_refs" ADD CONSTRAINT "opportunity_source_refs_source_id_opportunity_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."opportunity_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_skills" ADD CONSTRAINT "role_skills_role_id_role_profiles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_skills" ADD CONSTRAINT "role_skills_concept_id_skill_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."skill_concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_aliases" ADD CONSTRAINT "skill_aliases_concept_id_skill_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."skill_concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_relations" ADD CONSTRAINT "skill_relations_from_id_skill_concepts_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."skill_concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_relations" ADD CONSTRAINT "skill_relations_to_id_skill_concepts_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."skill_concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_reviewer_identity_id_user_identities_id_fk" FOREIGN KEY ("reviewer_identity_id") REFERENCES "public"."user_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestion_runs_source" ON "ingestion_runs" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learning_evidence_external" ON "learning_evidence" USING btree ("profile_id","external_id");--> statement-breakpoint
CREATE INDEX "learning_evidence_profile" ON "learning_evidence" USING btree ("profile_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_source_refs_record" ON "opportunity_source_refs" USING btree ("source_id","source_record_id");--> statement-breakpoint
CREATE INDEX "opportunity_source_refs_opp" ON "opportunity_source_refs" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "verification_events_target" ON "verification_events" USING btree ("target_type","target_id");--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD CONSTRAINT "opportunity_sources_permission_reviewed_by_user_identities_id_fk" FOREIGN KEY ("permission_reviewed_by") REFERENCES "public"."user_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunities_fingerprint" ON "opportunities" USING btree ("content_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_sources_adapter" ON "opportunity_sources" USING btree ("adapter_key");--> statement-breakpoint
-- Hand-written below: state vocabularies enforced by the database too, not only by TypeScript.
ALTER TABLE "opportunity_sources" ADD CONSTRAINT "opportunity_sources_permission_check" CHECK ("permission_status" IN ('unreviewed','approved_collection','approved_display','disabled'));--> statement-breakpoint
ALTER TABLE "opportunity_sources" ADD CONSTRAINT "opportunity_sources_authority_check" CHECK ("authority" IN ('official','employer','third_party','manual'));--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_verification_state_check" CHECK ("verification_state" IN ('unverified','source_confirmed','employer_confirmed','verified','expired','rejected'));--> statement-breakpoint
ALTER TABLE "opportunity_skills" ADD CONSTRAINT "opportunity_skills_origin_check" CHECK ("origin" IN ('listed','text_mentioned'));--> statement-breakpoint
ALTER TABLE "opportunity_skills" ADD CONSTRAINT "opportunity_skills_text_never_required" CHECK ("origin" = 'listed' OR "required" = false);--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_status_check" CHECK ("status" IN ('running','succeeded','partial','failed','skipped'));--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_kind_check" CHECK ("kind" IN ('asked','practiced','task_completed','assessment_attempted','assessment_passed','project_demonstrated'));--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_score_check" CHECK ("score" IS NULL OR ("max_score" IS NOT NULL AND "max_score" > 0 AND "score" >= 0 AND "score" <= "max_score"));--> statement-breakpoint
ALTER TABLE "skill_relations" ADD CONSTRAINT "skill_relations_kind_check" CHECK ("kind" IN ('related','prerequisite') AND "from_id" <> "to_id");--> statement-breakpoint
ALTER TABLE "role_skills" ADD CONSTRAINT "role_skills_importance_check" CHECK ("importance" IN ('essential','optional'));--> statement-breakpoint
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_target_check" CHECK ("target_type" IN ('opportunity','organization','source'));--> statement-breakpoint
-- Existing badges keep their meaning: an org-verified listing was created by a verified organization's account.
UPDATE "opportunities" SET "verification_state" = 'employer_confirmed' WHERE "verification" = 'org_verified';--> statement-breakpoint
UPDATE "opportunities" SET "verification_state" = 'source_confirmed' WHERE "verification" = 'source_verified';--> statement-breakpoint
-- Server-only data: no access through Supabase's public API roles (the app connects as the owner).
ALTER TABLE "ingestion_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "opportunity_source_refs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skill_concepts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skill_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skill_relations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "learning_evidence" ENABLE ROW LEVEL SECURITY;