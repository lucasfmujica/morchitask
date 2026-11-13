import { and, eq, getTableColumns, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles, tasks } from "@/lib/db/schema";

/**
 * Who may see and touch a task, inside one household.
 *
 * `householdId` keeps two households apart, but it says nothing about the two
 * people *inside* one: a household is a pair, and a task is private to its
 * owner unless it is marked `shared`. For a while every read by date and every
 * write by task id checked only the household, so a partner's private task
 * leaked through its blocks and subtasks, and with the leaked id it could be
 * renamed, completed or deleted. Every task read or write goes through one of
 * the helpers below, together with the household filter, never instead of it.
 */
export function visibleTo(userId: string): SQL {
  return or(eq(tasks.owner_id, userId), eq(tasks.shared, true))!;
}

/** One task, by id, as `userId` is allowed to see it. */
export function visibleTask(householdId: string, userId: string, taskId: string): SQL {
  return and(eq(tasks.id, taskId), eq(tasks.household_id, householdId), visibleTo(userId))!;
}

/**
 * For rows that hang off a task (blocks, subtasks, comments, attachments,
 * reactions, time entries): the parent task exists in this household and is
 * visible to `userId`. A child row has no owner of its own, so it is exactly as
 * private as its task.
 *
 * Raw table names on purpose: inside an UPDATE or DELETE, drizzle may render a
 * column unqualified, and an unqualified `"id"` inside this subquery would bind
 * to the wrong table.
 */
export function onVisibleTask(householdId: string, userId: string, taskIdColumn: AnyColumn): SQL {
  return sql`exists (select 1 from "tasks" where "tasks"."id" = ${taskIdColumn} and "tasks"."household_id" = ${householdId} and ("tasks"."owner_id" = ${userId} or "tasks"."shared"))`;
}

/**
 * The caller's own share of a task's tracked time.
 *
 * Tracked time is personal: on a shared task each person sees only their own
 * minutes. `tasks.actual_time_min` is the total across people (plus "Sin fecha"
 * time no day accounts for), so it cannot be shown to either of them as is.
 *
 * - The owner gets the total minus everyone else's dated entries: their own
 *   entries plus the undated remainder, which only the owner can write (see
 *   `setActualTime`).
 * - Anyone else gets the sum of their own entries, or null when they have none.
 */
export function myActualMinutes(userId: string) {
  return sql<number | null>`(case
    when "tasks"."owner_id" = ${userId} then
      case when "tasks"."actual_time_min" is null then null
      else greatest("tasks"."actual_time_min" - coalesce((select sum(tte.minutes) from "task_time_entries" tte where tte.task_id = "tasks"."id" and tte.user_id <> ${userId}), 0), 0)
      end
    else (select sum(tte.minutes) from "task_time_entries" tte where tte.task_id = "tasks"."id" and tte.user_id = ${userId})
  end)::float8`.mapWith(Number);
}

/** Every task column, with `actual_time_min` replaced by the caller's own
 *  minutes. What every task row sent to a person is selected with. */
export function taskColumnsFor(userId: string) {
  return { ...getTableColumns(tasks), actual_time_min: myActualMinutes(userId) };
}

/** Throws unless the task exists in this household and `userId` may see it.
 *  For inserts of child rows, which have no WHERE of their own to scope. */
export async function assertVisibleTask(householdId: string, userId: string, taskId: string) {
  const [row] = await db
    .select({ owner_id: tasks.owner_id, shared: tasks.shared })
    .from(tasks)
    .where(visibleTask(householdId, userId, taskId));
  if (!row) throw new Error("task not found");
  return row;
}

/** True when `profileId` is a member of this household. For ids a client sends
 *  to point at a person (task owner, subtask assignee). */
export async function isHouseholdMember(householdId: string, profileId: string) {
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.household_id, householdId)));
  return !!row;
}
