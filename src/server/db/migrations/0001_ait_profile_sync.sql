CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"source" text DEFAULT 'avsar' NOT NULL,
	"source_key" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"issuer" text,
	"date" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "graduation_year" integer;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "ait_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "ait_sync_status" text DEFAULT 'never' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "ait_sync_error" text;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "ait_scopes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "imported_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD COLUMN "source" text DEFAULT 'avsar' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "source" text DEFAULT 'avsar' NOT NULL;--> statement-breakpoint
ALTER TABLE "certifications" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "education" ADD COLUMN "source" text DEFAULT 'avsar' NOT NULL;--> statement-breakpoint
ALTER TABLE "education" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "source" text DEFAULT 'avsar' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiences" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source" text DEFAULT 'avsar' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_profile_id_candidate_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievements_profile" ON "achievements" USING btree ("profile_id");