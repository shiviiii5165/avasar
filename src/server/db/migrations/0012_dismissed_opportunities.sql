CREATE TABLE "dismissed_opportunities" (
	"identity_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dismissed_opportunities_identity_id_opportunity_id_pk" PRIMARY KEY("identity_id","opportunity_id")
);
--> statement-breakpoint
ALTER TABLE "dismissed_opportunities" ADD CONSTRAINT "dismissed_opportunities_identity_id_user_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."user_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dismissed_opportunities" ADD CONSTRAINT "dismissed_opportunities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;