import type {
  channels,
  dailyNotes,
  households,
  objectives,
  profiles,
  recurringTemplates,
  subtasks,
  taskAttachments,
  taskBlocks,
  taskComments,
  taskReactions,
  tasks,
} from "@/lib/db/schema";
import type { PriorityKey } from "@/lib/priority";

export type Task = typeof tasks.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Household = typeof households.$inferSelect;
export type Subtask = typeof subtasks.$inferSelect;
export type RecurringTemplate = typeof recurringTemplates.$inferSelect;
export type DailyNote = typeof dailyNotes.$inferSelect;
export type Objective = typeof objectives.$inferSelect;
export type TaskComment = typeof taskComments.$inferSelect;
export type TaskReaction = typeof taskReactions.$inferSelect;
export type TaskBlock = typeof taskBlocks.$inferSelect;
export type TaskAttachment = typeof taskAttachments.$inferSelect;

/** One person's tracked minutes on a task for one calendar day. */
export type TaskTimeEntry = { day: string; minutes: number; user_id: string };

export type TaskStatus = "todo" | "done" | "cancelled";
export type ObjectivePeriod = "week" | "month";
export type ObjectiveStatus = "active" | "done" | "archived";

// Shared input shapes between client hooks (lib/queries) and the server
// data-access layer (lib/db/queries) / Server Actions (lib/actions).

export type NewTask = {
  title: string;
  plannedDate: string | null;
  channelId?: string | null;
  timeEstimateMin?: number | null;
  priority?: PriorityKey;
  sortOrder: number;
};

/** A file already uploaded to Blob, on its way into `task_attachments`. */
export type NewAttachment = {
  url: string;
  pathname: string;
  name: string;
  contentType: string;
  sizeBytes: number;
};

export type TaskPatch = Partial<
  Pick<
    Task,
    | "title"
    | "notes"
    | "channel_id"
    | "time_estimate_min"
    | "actual_time_min"
    | "block_start"
    | "block_end"
    | "owner_id"
    | "shared"
    | "objective_id"
    | "gcal_event_id"
    | "remind_at"
    | "reminder_sent_at"
    | "due_date"
    | "priority"
  >
>;

/** Notification preferences stored on `profiles.notification_prefs` (jsonb). */
export type NotificationPrefs = {
  dailyPlan?: boolean;
  dailyPlanTime?: string;
  taskReminders?: boolean;
};

export type ProfilePatch = Partial<
  Pick<
    Profile,
    "display_name" | "color" | "capacity_target_min" | "avatar_url" | "notification_prefs"
  >
>;
