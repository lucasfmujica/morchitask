CREATE TABLE "weekly_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"wins" text,
	"lessons" text,
	"next_focus" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_notes_owner_id_week_start_unique" UNIQUE("owner_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "weekly_notes" ADD CONSTRAINT "weekly_notes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_notes" ADD CONSTRAINT "weekly_notes_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;