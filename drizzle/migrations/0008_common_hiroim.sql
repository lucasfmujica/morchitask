CREATE TABLE "subscriptions" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'polar' NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"provider_customer_id" text NOT NULL,
	"status" text NOT NULL,
	"recurring_interval" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "plan_override" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_customer_idx" ON "subscriptions" USING btree ("provider_customer_id");--> statement-breakpoint
-- Hand-written, and the most important statement in this file.
--
-- Every household that exists when billing ships predates it: nobody was told
-- there would be a price, nobody started a trial, and `trial_ends_at` is null
-- for all of them. Without this line, deploying locks the app's only two users
-- out of their own calendars the moment the migration runs.
--
-- Scoped to rows that exist *now*: anything created after this migration goes
-- through sign-up, which starts a real trial.
UPDATE "households" SET "plan_override" = 'comp' WHERE "plan_override" IS NULL;
