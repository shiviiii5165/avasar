CREATE TABLE "ait_webhook_deliveries" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"subject" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"outcome" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "ait_webhook_deliveries_subject" ON "ait_webhook_deliveries" USING btree ("subject");
--> statement-breakpoint
-- Server-to-server data only: no access through Supabase's public API roles (the app connects as the owner).
ALTER TABLE "ait_webhook_deliveries" ENABLE ROW LEVEL SECURITY;
