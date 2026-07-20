import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { taskBlocks, tasks } from "@/lib/db/schema";
import type { NewTask, TaskPatch } from "@/lib/queries/types";

/** Every read/write below is scoped to `householdId` from the session — this
 * is the app-level replacement for Supabase RLS (see migration plan). */

function mineOrShared(userId: string) {
  return or(eq(tasks.owner_id, userId), eq(tasks.shared, true));
}

export async function tasksForDate(householdId: string, userId: string, date: string) {
  return db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.household_id, householdId), eq(tasks.planned_date, date), mineOrShared(userId)),
    )
    .orderBy(asc(tasks.sort_order));
}

export async function backlogTasks(householdId: string, userId: string) {
  return db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.household_id, householdId), isNull(tasks.planned_date), mineOrShared(userId)),
    )
    .orderBy(asc(tasks.sort_order));
}

export async function monthCounts(householdId: string, userId: string, start: string, end: string) {
  return db
    .select({ planned_date: tasks.planned_date, status: tasks.status })
    .from(tasks)
    .where(
      and(
        eq(tasks.household_id, householdId),
        gte(tasks.planned_date, start),
        lte(tasks.planned_date, end),
        mineOrShared(userId),
      ),
    );
}

export async function tasksInRange(
  householdId: string,
  userId: string,
  start: string,
  end: string,
) {
  return db
    .select({
      planned_date: tasks.planned_date,
      status: tasks.status,
      time_estimate_min: tasks.time_estimate_min,
      actual_time_min: tasks.actual_time_min,
      channel_id: tasks.channel_id,
      owner_id: tasks.owner_id,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.household_id, householdId),
        gte(tasks.planned_date, start),
        lte(tasks.planned_date, end),
        mineOrShared(userId),
      ),
    );
}

export async function insertTask(householdId: string, ownerId: string, input: NewTask) {
  const [row] = await db
    .insert(tasks)
    .values({
      household_id: householdId,
      owner_id: ownerId,
      created_by: ownerId,
      title: input.title,
      planned_date: input.plannedDate,
      channel_id: input.channelId ?? null,
      time_estimate_min: input.timeEstimateMin ?? null,
      sort_order: input.sortOrder,
    })
    .returning();
  return row;
}

/** Scopes every update/delete to (id, household_id) so a request naming a
 * task from another household silently matches nothing. */
function scoped(householdId: string, taskId: string) {
  return and(eq(tasks.id, taskId), eq(tasks.household_id, householdId));
}

export async function toggleTaskDone(householdId: string, taskId: string, done: boolean) {
  const [row] = await db
    .update(tasks)
    .set({
      status: done ? "done" : "todo",
      completed_at: done ? new Date().toISOString() : null,
    })
    .where(scoped(householdId, taskId))
    .returning();
  if (!row) throw new Error("task not found");
  return row;
}

export async function updateTask(householdId: string, taskId: string, patch: TaskPatch) {
  const [row] = await db.update(tasks).set(patch).where(scoped(householdId, taskId)).returning();
  if (!row) throw new Error("task not found");
  return row;
}

export async function setActualTime(householdId: string, taskId: string, actualMin: number) {
  await db.update(tasks).set({ actual_time_min: actualMin }).where(scoped(householdId, taskId));
}

export async function setActiveSince(householdId: string, taskId: string, active: boolean) {
  await db
    .update(tasks)
    .set({ active_since: active ? new Date().toISOString() : null })
    .where(scoped(householdId, taskId));
}

export async function taskBlockCalendarEventIds(householdId: string, taskId: string) {
  const rows = await db
    .select({ gcal_event_id: taskBlocks.gcal_event_id })
    .from(taskBlocks)
    .where(and(eq(taskBlocks.task_id, taskId), eq(taskBlocks.household_id, householdId)));
  return rows.map((r) => r.gcal_event_id).filter((id): id is string => !!id);
}

export async function deleteTaskBlocks(householdId: string, taskId: string) {
  await db
    .delete(taskBlocks)
    .where(and(eq(taskBlocks.task_id, taskId), eq(taskBlocks.household_id, householdId)));
}

export async function deleteTask(householdId: string, taskId: string) {
  await db.delete(tasks).where(scoped(householdId, taskId));
}

export async function moveTaskToDate(
  householdId: string,
  taskId: string,
  toDate: string,
  sortOrder: number,
) {
  await db
    .update(tasks)
    .set({ planned_date: toDate, sort_order: sortOrder, block_start: null, block_end: null })
    .where(scoped(householdId, taskId));
}

export async function reorderTask(householdId: string, taskId: string, sortOrder: number) {
  await db.update(tasks).set({ sort_order: sortOrder }).where(scoped(householdId, taskId));
}
