CREATE TABLE "stint_links" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"token" text NOT NULL,
	"channel_id" uuid,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "stint_task_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "stint_status" text;--> statement-breakpoint
ALTER TABLE "stint_links" ADD CONSTRAINT "stint_links_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stint_links" ADD CONSTRAINT "stint_links_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stint_links" ADD CONSTRAINT "stint_links_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_owner_stint_unique" ON "tasks" USING btree ("owner_id","stint_task_id") WHERE "tasks"."stint_task_id" is not null;