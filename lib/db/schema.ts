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
// App tables — ported 1:1 from the Supabase schema this replaced.
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
  /**
   * When this household's free trial runs out. Set once, at sign-up.
   *
   * On the household and not on the profile because the space is what is being
   * sold: someone invited into an existing space is not starting their own
   * trial, and should not get a second fourteen days by being invited.
   */
  trial_ends_at: timestamp("trial_ends_at", { withTimezone: true, mode: "string" }),
  /**
   * An account that is never charged and never asked to pay. `'comp'` is the
   * only value the code recognises — anything else is treated as no override,
   * so a typo locks nobody in for free.
   *
   * Exists for the two accounts that predate billing, and for the handful of
   * lifetime accounts the launch plan gives away. Deliberately separate from
   * `subscriptions`: a comp is not a subscription with a weird status, it is
   * the absence of one, and mixing them would put fake rows in the revenue
   * reports.
   */
  plan_override: text("plan_override"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow()
    .$onUpdateFn(touchUpdatedAt),
});

/**
 * What the payment provider says about this household, mirrored locally.
 *
 * A mirror and not a source of truth: Polar owns the subscription, this row is
 * a cache so that deciding whether to open the app is one local read instead of
 * an HTTP call on the critical path of every request. Which means it can be
 * stale, and `lib/billing.ts` is written to expect that — see the webhook grace
 * period there.
 *
 * One row per household, not per user: the space is the thing being sold, and
 * the second person in a shared space is included rather than billed.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    household_id: uuid("household_id")
      .primaryKey()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Named rather than assumed, so a future move off Polar is a migration and
     *  not an archaeology exercise. */
    provider: text("provider").notNull().default("polar"),
    provider_subscription_id: text("provider_subscription_id").notNull().unique(),
    provider_customer_id: text("provider_customer_id").notNull(),
    /** Polar's vocabulary, mirrored verbatim — see SUBSCRIPTION_STATUSES in
     *  lib/billing.ts. Stored as text so an unfamiliar status from a future
     *  provider version lands in the row instead of failing the webhook. */
    status: text("status").notNull(),
    /** "month" or "year". Display only; the price lives in lib/pricing.ts. */
    recurring_interval: text("recurring_interval"),
    current_period_end: timestamp("current_period_end", { withTimezone: true, mode: "string" }),
    cancel_at_period_end: boolean("cancel_at_period_end").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow()
      .$onUpdateFn(touchUpdatedAt),
  },
  (t) => [index("subscriptions_customer_idx").on(t.provider_customer_id)],
);

/**
 * A standing invitation to join a household.
 *
 * This table is what makes joining someone else's space an explicit act. Until
 * it existed, `createUser` put every new sign-in into the oldest household on
 * the assumption that there would only ever be one — which meant a stranger
 * signing up landed inside someone else's data.
 *
 * Matched on `email` at sign-up rather than on a link click: the invitee has no
 * account yet when the invite is sent, so there is no user id to point at. The
 * token is for the accept link; the email is what the claim actually keys on.
 */
export const householdInvites = pgTable(
  "household_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    invited_by: uuid("invited_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** Stored lowercased — the claim compares against a lowercased address. */
    email: text("email").notNull(),
    token: text("token").notNull().unique(),
    expires_at: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    /** Set once claimed, so a single invite can't seed two accounts. */
    accepted_at: timestamp("accepted_at", { withTimezone: true, mode: "string" }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("household_invites_email_idx")
      .on(t.email)
      .where(sql`${t.accepted_at} is null`),
    index("household_invites_household_idx").on(t.household_id),
  ],
);

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
    /** Interface language. The cookie that renders each request is a copy of
     *  this; the column is what makes the choice follow you to another device. */
    locale: text("locale").notNull().default("es"),
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
    /**
     * When this day's leftovers were swept forward from earlier days.
     *
     * The sweep is automatic, so it needs a memory: without this it would run
     * again on every visit and undo would be pointless — whatever you sent back
     * would return the moment you reopened Today. Set once per person per day,
     * and deliberately NOT cleared by undo, since undo means "not today".
     *
     * On `daily_notes` rather than on the profile because it is a fact about a
     * day, and the unique (owner_id, note_date) already makes it one per day.
     */
    carried_over_at: timestamp("carried_over_at", { withTimezone: true, mode: "string" }),
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

/**
 * Files attached to a task. The bytes live in Vercel Blob; this table only
 * records where they are and who put them there.
 *
 * `pathname` is stored alongside `url` because deleting the blob needs the
 * path — without it a deleted attachment would leave its file behind forever.
 */
export const taskAttachments = pgTable(
  "task_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    household_id: uuid("household_id")
      .notNull()
      .references(() => households.id),
    task_id: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    uploader_id: uuid("uploader_id")
      .notNull()
      .references(() => profiles.id),
    url: text("url").notNull(),
    pathname: text("pathname").notNull(),
    /** The name the file had on the uploader's device, for display. */
    name: text("name").notNull(),
    content_type: text("content_type").notNull(),
    size_bytes: integer("size_bytes").notNull(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("task_attachments_task_idx").on(t.task_id, t.created_at)],
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
