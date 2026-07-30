import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { TaskPriority } from "@/lib/priority";

/** Matches the Supabase `set_updated_at()` trigger, applied via Drizzle
 * instead of a DB trigger since every write goes through this ORM. */
const touchUpdatedAt = () => sql`now()`;

// ---------------------------------------------------------------------------
// Auth.js tables (shape required by @auth/drizzle-adapter).
// `users.id` keeps the same UUIDs Supabase's `auth.users.id` used, so every
// FK below (profiles.id, tasks.owner_id, etc.) needs no remapping during the
// data migration — see docs/GOOGLE_SETUP.md history for why that matters.
// ---------------------------------------------------------------------------

export const users = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---------------------------------------------------------------------------
// App tables — ported 1:1 from lib/supabase/database.types.ts.
// google_credentials is dropped: the Google refresh token now lives on
// `accounts` (provider = "google"), populated automatically by the adapter.
//
// JS property names deliberately match the snake_case DB column names (not
// idiomatic Drizzle style, which favors camelCase JS + a casing config).
// The whole app — ~50 components — reads fields like `task.planned_date`,
// a shape carried over from the Supabase-generated types. Keeping the same
// shape here means the data-access layer is a mechanical Supabase->Drizzle
// port and no component needs to change.
// ---------------------------------------------------------------------------

export const households = pgTable("households", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().default("Mi hogar"),
  timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
  week_starts_on: smallint("week_starts_on").notNull().default(1),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow()
    .$onUpdateFn(touchUpdatedAt),
});

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id),
    display_name: text("display_name").notNull().default("Sin nombre"),
    color: text("color").notNull().default("#0d9488"),
    avatar_url: text("avatar_url"),
    capacity_target_min: integer("capacity_target_min"),
    notification_prefs: jsonb("notification_prefs").notNull().default({}),
    google_calendar_connected: boolean("google_calendar_connected").notNull().default(false),
    gcal_target_calendar_id: text("gcal_target_calendar_id"),
    spotify_connected: boolean("spotify_connected").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow()
      .$onUpdateFn(touchUpdatedAt),
  },
  (t) => [index("profiles_household_idx").on(t.household_id)],
);

export const spotifyCredentials = pgTable("spotify_credentials", {
  owner_id: uuid("owner_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  refresh_token: text("refresh_token").notNull(),
  scope: text("scope"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id),
    owner_id: uuid("owner_id")
      .notNull()
      .references(() => profiles.id),
    name: text("name").notNull(),
    color: text("color").notNull().default("#0d9488"),
    icon: text("icon"),
    sort_order: integer("sort_order").notNull().default(0),
    archived_at: timestamp("archived_at", { withTimezone: true, mode: "string" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow()
      .$onUpdateFn(touchUpdatedAt),
  },
  (t) => [
    index("channels_household_idx").on(t.household_id),
    index("channels_owner_idx").on(t.owner_id),
  ],
);

export const objectives = pgTable("objectives", {
  id: uuid("id").defaultRandom().primaryKey(),
  household_id: uuid("household_id")
    .notNull()
    .references(() => households.id),
  owner_id: uuid("owner_id")
    .notNull()
    .references(() => profiles.id),
  title: text("title").notNull(),
  period: text("period").notNull().default("week"),
  status: text("status").notNull().default("active"),
  start_date: date("start_date", { mode: "string" }).notNull(),
  end_date: date("end_date", { mode: "string" }).notNull(),
  sort_order: numeric("sort_order", { mode: "number" }).notNull().default(1000),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow()
    .$onUpdateFn(touchUpdatedAt),
});

export const dailyNotes = pgTable(
  "daily_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id),
    owner_id: uuid("owner_id")
      .notNull()
      .references(() => profiles.id),
    note_date: date("note_date", { mode: "string" }).notNull(),
    intention: text("intention"),
    reflection: text("reflection"),
    mood: smallint("mood"),
    capacity_min: integer("capacity_min"),
    end_target_min: integer("end_target_min"),
    plan_completed_at: timestamp("plan_completed_at", { withTimezone: true, mode: "string" }),
    shutdown_completed_at: timestamp("shutdown_completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow()
      .$onUpdateFn(touchUpdatedAt),
  },
  // The unique constraint below also serves as the (owner_id, note_date)
  // lookup index — Supabase additionally had a redundant plain index on the
  // same columns, not replicated here.
  (t) => [unique().on(t.owner_id, t.note_date)],
);

export const recurringTemplates = pgTable(
  "recurring_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id),
    owner_id: uuid("owner_id")
      .notNull()
      .references(() => profiles.id),
    channel_id: uuid("channel_id").references(() => channels.id),
    title: text("title").notNull(),
    notes: text("notes"),
    freq: text("freq").notNull().default("daily"),
    weekdays: smallint("weekdays").array(),
    time_estimate_min: integer("time_estimate_min"),
    active_from: date("active_from", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_DATE`),
    active_until: date("active_until", { mode: "string" }),
    paused: boolean("paused").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow()
      .$onUpdateFn(touchUpdatedAt),
  },
  (t) => [index("recurring_household_idx").on(t.household_id)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id),
    owner_id: uuid("owner_id")
      .notNull()
      .references(() => profiles.id),
    created_by: uuid("created_by").references(() => profiles.id),
    channel_id: uuid("channel_id").references(() => channels.id),
    objective_id: uuid("objective_id").references(() => objectives.id),
    template_id: uuid("template_id").references(() => recurringTemplates.id),
    template_date: date("template_date", { mode: "string" }),
    title: text("title").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("todo"),
    /** null = "Sin prioridad" (the default) — sorts after high/medium/low. */
    priority: text("priority").$type<TaskPriority>(),
    shared: boolean("shared").notNull().default(false),
    sort_order: numeric("sort_order", { mode: "number" }).notNull().default(1000),
    planned_date: date("planned_date", { mode: "string" }),
    due_date: date("due_date", { mode: "string" }),
    time_estimate_min: integer("time_estimate_min"),
    actual_time_min: numeric("actual_time_min", { mode: "number" }),
    block_start: timestamp("block_start", { withTimezone: true, mode: "string" }),
    block_end: timestamp("block_end", { withTimezone: true, mode: "string" }),
    active_since: timestamp("active_since", { withTimezone: true, mode: "string" }),
    completed_at: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    remind_at: timestamp("remind_at", { withTimezone: true, mode: "string" }),
    reminder_sent_at: timestamp("reminder_sent_at", { withTimezone: true, mode: "string" }),
    rollover_count: integer("rollover_count").notNull().default(0),
    rollover_origin_date: date("rollover_origin_date", { mode: "string" }),
    gcal_event_id: text("gcal_event_id"),
    gcal_synced_at: timestamp("gcal_synced_at", { withTimezone: true, mode: "string" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow()
      .$onUpdateFn(touchUpdatedAt),
  },
  (t) => [
    unique("tasks_template_day_unique").on(t.template_id, t.template_date),
    index("tasks_household_block_idx").on(t.household_id, t.block_start),
    index("tasks_household_channel_idx").on(t.household_id, t.channel_id),
    index("tasks_household_owner_planned_idx").on(t.household_id, t.owner_id, t.planned_date),
    index("tasks_household_planned_idx").on(t.household_id, t.planned_date),
    index("tasks_objective_id_idx").on(t.objective_id),
    index("tasks_due_date_idx")
      .on(t.due_date)
      .where(sql`${t.due_date} is not null`),
    index("tasks_owner_shared_idx")
      .on(t.household_id, t.owner_id)
      .where(sql`${t.shared}`),
    index("tasks_remind_at_pending_idx")
      .on(t.remind_at)
      .where(sql`${t.remind_at} is not null and ${t.reminder_sent_at} is null`),
    index("tasks_todo_idx")
      .on(t.household_id, t.planned_date)
      .where(sql`${t.status} = 'todo'`),
    // updateTask writes a client-supplied patch straight into set() — this is
    // what stops a bogus priority from ever landing in the row.
    check(
      "tasks_priority_check",
      sql`${t.priority} is null or ${t.priority} in ('high','medium','low')`,
    ),
  ],
);

export const taskBlocks = pgTable(
  "task_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id),
    task_id: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    start_at: timestamp("start_at", { withTimezone: true, mode: "string" }).notNull(),
    end_at: timestamp("end_at", { withTimezone: true, mode: "string" }).notNull(),
    gcal_event_id: text("gcal_event_id"),
    gcal_synced_at: timestamp("gcal_synced_at", { withTimezone: true, mode: "string" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_blocks_task_idx").on(t.task_id),
    index("task_blocks_start_idx").on(t.start_at),
  ],
);

export const subtasks = pgTable(
  "subtasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id),
    task_id: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    assignee_id: uuid("assignee_id").references(() => profiles.id),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    sort_order: numeric("sort_order", { mode: "number" }).notNull().default(1000),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow()
      .$onUpdateFn(touchUpdatedAt),
  },
  (t) => [
    index("subtasks_household_idx").on(t.household_id),
    index("subtasks_task_idx").on(t.task_id),
    index("subtasks_assignee_id_idx").on(t.assignee_id),
  ],
);

/**
 * One row per (task, person, calendar day) of tracked time — the day-by-day
 * breakdown behind `tasks.actual_time_min`.
 *
 * A task that rolls over keeps its total on the task row, so everything that
 * already reads `actual_time_min` (analytics, shutdown, the card) is untouched;
 * these rows answer the finer question "how much did I put in *today* vs
 * yesterday". A stopwatch run that crosses local midnight is split into one row
 * per day before it gets here (see lib/time-entries.ts).
 */
export const taskTimeEntries = pgTable(
  "task_time_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id),
    task_id: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    /** Calendar day in the household timezone, not UTC. */
    day: date("day", { mode: "string" }).notNull(),
    minutes: numeric("minutes", { mode: "number" }).notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow()
      .$onUpdateFn(touchUpdatedAt),
  },
  (t) => [
    // One row per person per day: the write path is an upsert that adds onto
    // it, so a day's total can't fragment across many rows.
    unique("task_time_entries_task_user_day_unique").on(t.task_id, t.user_id, t.day),
    index("task_time_entries_task_idx").on(t.task_id, t.day),
    index("task_time_entries_household_day_idx").on(t.household_id, t.day),
  ],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id),
    task_id: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    author_id: uuid("author_id")
      .notNull()
      .references(() => profiles.id),
    body: text("body").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("task_comments_task_idx").on(t.task_id, t.created_at)],
);

export const taskReactions = pgTable(
  "task_reactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id),
    task_id: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    author_id: uuid("author_id")
      .notNull()
      .references(() => profiles.id),
    emoji: text("emoji").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_reactions_task_idx").on(t.task_id),
    unique("task_reactions_task_id_author_id_emoji_key").on(t.task_id, t.author_id, t.emoji),
  ],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  profile_id: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth_key: text("auth_key").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});
