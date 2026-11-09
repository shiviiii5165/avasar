ALTER TABLE "assessments" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "score" integer;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "max_score" integer;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_user_identities_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_identities"("id") ON DELETE no action ON UPDATE no action;