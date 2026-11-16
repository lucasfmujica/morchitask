ALTER TABLE "profiles" ADD COLUMN "timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payer_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider_modified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "remind_by" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payer_id_profiles_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_remind_by_profiles_id_fk" FOREIGN KEY ("remind_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Everyone starts in the zone their space had, so no day boundary moves.
UPDATE "profiles" p SET "timezone" = h."timezone" FROM "households" h WHERE h."id" = p."household_id" AND p."timezone" <> h."timezone";--> statement-breakpoint
-- The payer used to be a key in the member's notification_prefs, valued with
-- the household id. Copy it across; the key itself is left in place so the
-- code running during the deploy keeps working, and is ignored afterwards.
UPDATE "subscriptions" s SET "payer_id" = p."id" FROM "profiles" p WHERE p."household_id" = s."household_id" AND p."notification_prefs" ->> 'billing_manager_for' = s."household_id"::text AND s."payer_id" IS NULL;
