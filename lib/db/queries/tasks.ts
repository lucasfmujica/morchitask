import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  lte,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import { taskBlocks, tasks } from "@/lib/db/schema";
import type { PriorityKey } from "@/lib/priority";
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

/**
 * Escape LIKE/ILIKE metacharacters so user input is matched literally.
 * Without this a query of "%" matches every row and "_" matches any character —
 * the pattern wrapping below would turn either into an accidental wildcard.
 */
export function escapeLike(input: string) {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Accent-folding maps for Postgres `translate()`. The two strings MUST stay the
 * same length — translate() pairs them position by position.
 *
 * Why not `unaccent()`: that's an extension, so it would mean a migration on a
 * live database for a two-person app. `translate()` is plain SQL, covers every
 * accent Spanish uses, and needs nothing installed.
 */
export const ACCENTED = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
export const UNACCENTED = "aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC";

/** `expr` lowercased and stripped of accents, for comparison. */
function fold(expr: SQL | AnyColumn | string) {
  return sql`translate(lower(${expr}), ${ACCENTED}, ${UNACCENTED})`;
}

/**
 * Free-text search across the household's visible tasks, for the ⌘K palette.
 *
 * Returns FULL rows, not a projection: selecting a result opens the task detail
 * sheet, which needs every column. Safe to do here because the result set is
 * capped — unlike `tasksInRange`, which projects because it spans a month.
 *
 * BOTH sides are accent-folded. A plain ILIKE is accent-SENSITIVE, so "sabanas"
 * found nothing for a task called "Cambiar las sábanas" — and the client's
 * diacritic-insensitive matcher never ran, because there was nothing to rank.
 * In a Spanish app the folding has to happen here, at the point of recall.
 */
export async function searchTasks(householdId: string, userId: string, query: string, limit = 20) {
  const pattern = `%${escapeLike(query)}%`;
  return (
    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.household_id, householdId),
          mineOrShared(userId),
          or(
            sql`${fold(tasks.title)} like ${fold(pattern)}`,
            sql`${fold(sql`coalesce(${tasks.notes}, '')`)} like ${fold(pattern)}`,
          ),
        ),
      )
      // Pending before done, then most recently planned. Undated (backlog) tasks
      // sort last rather than first, which `nulls last` handles explicitly.
      .orderBy(
        sql`(${tasks.status} = 'done')`,
        sql`${tasks.planned_date} desc nulls last`,
        desc(tasks.created_at),
      )
      .limit(limit)
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
      priority: input.priority ?? null,
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

/** Add to the tracked time instead of overwriting it — used when a stopwatch
 *  stops, so a manual edit (or another device's run) isn't clobbered. */
export async function addActualTime(householdId: string, taskId: string, deltaMin: number) {
  await db
    .update(tasks)
    .set({ actual_time_min: sql`coalesce(${tasks.actual_time_min}, 0) + ${deltaMin}` })
    .where(scoped(householdId, taskId));
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

/** `priority: undefined` leaves the column alone; `null` clears it. Dragging a
 *  card into another priority group moves and re-prioritizes it in one write. */
export async function moveTaskToDate(
  householdId: string,
  taskId: string,
  toDate: string,
  sortOrder: number,
  priority?: PriorityKey,
) {
  await db
    .update(tasks)
    .set({
      planned_date: toDate,
      sort_order: sortOrder,
      block_start: null,
      block_end: null,
      ...(priority !== undefined && { priority }),
    })
    .where(scoped(householdId, taskId));
}

export async function reorderTask(
  householdId: string,
  taskId: string,
  sortOrder: number,
  priority?: PriorityKey,
) {
  await db
    .update(tasks)
    .set({ sort_order: sortOrder, ...(priority !== undefined && { priority }) })
    .where(scoped(householdId, taskId));
}
