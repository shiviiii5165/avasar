ALTER TABLE "interviews" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "interviewers" text;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "status" text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD COLUMN "accepted_by" uuid;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD COLUMN "invited_by" uuid;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_user_identities_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_accepted_by_user_identities_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_user_identities_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_identities_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_token" ON "organization_invitations" USING btree ("token_hash");