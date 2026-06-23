import type { Tables } from "@/lib/supabase/database.types";

export type Task = Tables<"tasks">;
export type Channel = Tables<"channels">;
export type Profile = Tables<"profiles">;
export type Household = Tables<"households">;
export type Subtask = Tables<"subtasks">;
export type RecurringTemplate = Tables<"recurring_templates">;
export type DailyNote = Tables<"daily_notes">;
export type Objective = Tables<"objectives">;

export type TaskStatus = "todo" | "done" | "cancelled";
export type ObjectivePeriod = "week" | "month";
export type ObjectiveStatus = "active" | "done" | "archived";
