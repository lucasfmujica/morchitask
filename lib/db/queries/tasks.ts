import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  lte,
  ne,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { db, dbPool } from "@/lib/db/client";
import {
  channels,
  objectives,
  profiles,
  recurringTemplates,
  subtasks,
  taskAttachments,
  taskBlocks,
  taskComments,
  taskReactions,
  taskTimeEntries,
  tasks,
} from "@/lib/db/schema";
import { isExpectedOccurrence } from "@/lib/streaks";
import { pickTaskPatch } from "@/lib/patches";
import type { PriorityKey } from "@/lib/priority";
import { applyDayEdit } from "@/lib/time-entries";
import type { NewTask, TaskPatch } from "@/lib/queries/types";
import {
  assertVisibleTask,
  onVisibleTask,
  taskColumnsFor,
  visibleTask,
  visibleTo,
} from "./visibility";

/** Every read/write below is scoped to `householdId` from the session — this
 * is the app-level replacement for Supabase RLS (see migration plan) — AND to
 * what the asking person may see inside it (`visibleTo`): their own tasks plus
 * the shared ones. Every task row returned carries the caller's own minutes in
 * `actual_time_min`, never the total across people (see `myActualMinutes`). */

const mineOrShared = visibleTo;

/** A skipped routine instance (see `deleteTask`): kept only to hold its day's
 *  slot, and hidden from every read. */
const CANCELLED = "cancelled";
const notCancelled = ne(tasks.status, CANCELLED);

export async function tasksForDate(householdId: string, userId: string, date: string) {
  return db
    .select(taskColumnsFor(userId))
    .from(tasks)
    .where(
      and(
        eq(tasks.household_id, householdId),
        eq(tasks.planned_date, date),
        mineOrShared(userId),
        notCancelled,
      ),
    )
    .orderBy(asc(tasks.sort_order));
}

export async function backlogTasks(householdId: string, userId: string) {
  return db
    .select(taskColumnsFor(userId))
    .from(tasks)
    .where(
      and(
        eq(tasks.household_id, householdId),
        isNull(tasks.planned_date),
        mineOrShared(userId),
        notCancelled,
      ),
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
        notCancelled,
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
      id: tasks.id,
      title: tasks.title,
      due_date: tasks.due_date,
      planned_date: tasks.planned_date,
      status: tasks.status,
      time_estimate_min: tasks.time_estimate_min,
      actual_time_min: taskColumnsFor(userId).actual_time_min,
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
        notCancelled,
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
      .select(taskColumnsFor(userId))
      .from(tasks)
      .where(
        and(
          eq(tasks.household_id, householdId),
          mineOrShared(userId),
          notCancelled,
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
 * task from another household silently matches nothing — and to what the
 * caller may see, so a request naming the partner's PRIVATE task matches
 * nothing either. */
function scoped(householdId: string, userId: string, taskId: string) {
  return visibleTask(householdId, userId, taskId);
}

export async function toggleTaskDone(
  householdId: string,
  userId: string,
  taskId: string,
  done: boolean,
) {
  const [row] = await db
    .update(tasks)
    .set({
      status: done ? "done" : "todo",
      completed_at: done ? new Date().toISOString() : null,
    })
    .where(scoped(householdId, userId, taskId))
    .returning(taskColumnsFor(userId));
  if (!row) throw new Error("task not found");
  return row;
}

/**
 * Applies a client patch, rebuilt from a whitelist first (`pickTaskPatch`):
 * the patch arrives as untyped JSON, and spreading it into `set()` once let a
 * request move a task into another household. A new owner has to be someone
 * in this household. `actual_time_min` is ignored here — see `setActualTime`.
 */
export async function updateTask(
  householdId: string,
  userId: string,
  taskId: string,
  patch: TaskPatch,
) {
  const clean = pickTaskPatch(patch);
  // Ids the client names must point inside this household: a person, a
  // category, a goal. Otherwise the update matches nothing and throws.
  const where = and(
    scoped(householdId, userId, taskId),
    clean.owner_id
      ? sql`exists (select 1 from ${profiles} where ${profiles.id} = ${clean.owner_id} and ${profiles.household_id} = ${householdId})`
      : undefined,
    clean.channel_id
      ? sql`exists (select 1 from ${channels} where ${channels.id} = ${clean.channel_id} and ${channels.household_id} = ${householdId})`
      : undefined,
    clean.objective_id
      ? sql`exists (select 1 from ${objectives} where ${objectives.id} = ${clean.objective_id} and ${objectives.household_id} = ${householdId})`
      : undefined,
  );
  if (Object.keys(clean).length === 0) {
    const [row] = await db.select(taskColumnsFor(userId)).from(tasks).where(where);
    if (!row) throw new Error("task not found");
    return row;
  }
  const [row] = await db.update(tasks).set(clean).where(where).returning(taskColumnsFor(userId));
  if (!row) throw new Error("task not found");
  return row;
}

/** Sum of everyone's dated entries on a task, and the caller's own share. */
async function entrySums(taskId: string, userId: string) {
  const [row] = await db
    .select({
      all: sql<number>`coalesce(sum(${taskTimeEntries.minutes}), 0)::float8`.mapWith(Number),
      mine: sql<number>`coalesce(sum(${taskTimeEntries.minutes}) filter (where ${taskTimeEntries.user_id} = ${userId}), 0)::float8`.mapWith(
        Number,
      ),
    })
    .from(taskTimeEntries)
    .where(eq(taskTimeEntries.task_id, taskId));
  return { all: row?.all ?? 0, mine: row?.mine ?? 0 };
}

/**
 * Set "Real" by hand: the caller's own total on the task.
 *
 * The owner's number is their dated entries plus the undated remainder, so for
 * them this sets the remainder and the task total becomes their number plus
 * everyone else's entries — the partner's time on a shared task is untouched.
 *
 * Anyone else has no undated remainder to put a hand edit in (there is no
 * column for it per person), so on someone else's shared task the edit is
 * refused: their time goes in by day, in the breakdown under it.
 */
export async function setActualTime(
  householdId: string,
  userId: string,
  taskId: string,
  actualMin: number | null,
) {
  const task = await assertVisibleTask(householdId, userId, taskId);
  if (task.owner_id !== userId) throw new Error("not the owner");
  const { all, mine } = await entrySums(taskId, userId);
  const others = all - mine;
  const next = actualMin === null ? (others > 0 ? others : null) : Math.max(0, actualMin) + others;
  await db
    .update(tasks)
    .set({ actual_time_min: next })
    .where(scoped(householdId, userId, taskId));
}

/**
 * Log a finished stopwatch run: one row per calendar day it covered, plus the
 * same amount added onto the task's total.
 *
 * Additive on both sides — a manual edit of "Real" during the run, or a stop
 * from the other device, must not be clobbered. Sent as a single batch so the
 * per-day rows and the total can't drift apart if one statement fails.
 */
export async function logTaskTime(
  householdId: string,
  userId: string,
  taskId: string,
  segments: { day: string; minutes: number }[],
) {
  const positive = segments.filter((s) => s.minutes > 0);
  if (positive.length === 0) return;
  // The entry inserts below have no WHERE to scope them, so check first.
  await assertVisibleTask(householdId, userId, taskId);
  const total = positive.reduce((sum, s) => sum + s.minutes, 0);

  await db.batch([
    ...positive.map((s) =>
      db
        .insert(taskTimeEntries)
        .values({
          household_id: householdId,
          task_id: taskId,
          user_id: userId,
          day: s.day,
          minutes: s.minutes,
        })
        // Same person, same day, second run → add onto the existing row.
        .onConflictDoUpdate({
          target: [taskTimeEntries.task_id, taskTimeEntries.user_id, taskTimeEntries.day],
          set: { minutes: sql`${taskTimeEntries.minutes} + ${s.minutes}`, updated_at: sql`now()` },
        }),
    ),
    db
      .update(tasks)
      .set({ actual_time_min: sql`coalesce(${tasks.actual_time_min}, 0) + ${total}` })
      .where(scoped(householdId, userId, taskId)),
    // batch() wants a non-empty tuple; this array is built from a list, and the
    // early return above is what guarantees it isn't empty.
  ] as unknown as Parameters<typeof db.batch>[0]);
}

/**
 * Hand-edit how much *this* user spent on one day, keeping the task total in
 * step (see `applyDayEdit` for why adding to a day eats "Sin fecha" first).
 *
 * Read-then-write rather than a single SQL statement: the total depends on how
 * much of the task's time no day accounts for, which is a sum across rows. The
 * window between the two is a person hand-typing a number in a two-person app —
 * and the write is a batch, so entry and total still can't drift apart.
 */
export async function setTaskDayTime(
  householdId: string,
  userId: string,
  taskId: string,
  day: string,
  minutes: number,
) {
  const [entries, [task]] = await Promise.all([
    allTimeEntriesForTask(householdId, taskId),
    db
      .select({ actual: tasks.actual_time_min, owner_id: tasks.owner_id })
      .from(tasks)
      .where(scoped(householdId, userId, taskId)),
  ]);
  if (!task) throw new Error("task not found");

  // The undated remainder is the owner's (see `setActualTime`): someone else
  // adding a day on a shared task must not eat into it, so for them the edit
  // is computed as if there were none.
  const tracked = entries.reduce((sum, e) => sum + e.minutes, 0);
  const total = task.owner_id === userId ? (task.actual ?? 0) : tracked;
  const offset = (task.actual ?? 0) - total;
  const edit = applyDayEdit(entries, total, userId, day, minutes);
  const entryMinutes = edit.entryMinutes;
  const nextTotal = Math.max(0, edit.nextTotal + offset);

  const isMine = and(
    eq(taskTimeEntries.task_id, taskId),
    eq(taskTimeEntries.user_id, userId),
    eq(taskTimeEntries.day, day),
  );

  await db.batch([
    entryMinutes > 0
      ? db
          .insert(taskTimeEntries)
          .values({
            household_id: householdId,
            task_id: taskId,
            user_id: userId,
            day,
            minutes: entryMinutes,
          })
          // Set, not add: this is a correction, not another stopwatch run.
          .onConflictDoUpdate({
            target: [taskTimeEntries.task_id, taskTimeEntries.user_id, taskTimeEntries.day],
            set: { minutes: entryMinutes, updated_at: sql`now()` },
          })
      : // Zero means "I didn't work that day" — leave no empty row behind.
        db.delete(taskTimeEntries).where(isMine),
    db
      .update(tasks)
      .set({ actual_time_min: nextTotal })
      .where(scoped(householdId, userId, taskId)),
  ]);
}

/** Everyone's entries on a task. Internal only: the totals need them, but
 *  they must never be sent to a person as is. */
async function allTimeEntriesForTask(householdId: string, taskId: string) {
  return db
    .select({
      day: taskTimeEntries.day,
      minutes: taskTimeEntries.minutes,
      user_id: taskTimeEntries.user_id,
    })
    .from(taskTimeEntries)
    .where(and(eq(taskTimeEntries.task_id, taskId), eq(taskTimeEntries.household_id, householdId)));
}

/**
 * The caller's own day-by-day tracked time on one task, oldest first.
 *
 * Only theirs: on a shared task the partner's rows sit right next to these,
 * and tracked time is personal. Nothing at all when the task is the partner's
 * private one.
 */
export async function timeEntriesForTask(householdId: string, userId: string, taskId: string) {
  return db
    .select({
      day: taskTimeEntries.day,
      minutes: taskTimeEntries.minutes,
      user_id: taskTimeEntries.user_id,
    })
    .from(taskTimeEntries)
    .innerJoin(tasks, eq(tasks.id, taskTimeEntries.task_id))
    .where(
      and(
        eq(taskTimeEntries.task_id, taskId),
        eq(taskTimeEntries.household_id, householdId),
        eq(taskTimeEntries.user_id, userId),
        visibleTask(householdId, userId, taskId),
      ),
    )
    .orderBy(asc(taskTimeEntries.day));
}

/**
 * Minutes *this user* tracked per day within [start, end] (inclusive ISO days),
 * across all their tasks: the "worked" the day strips draw.
 *
 * Scoped by household AND user. Tracked time is personal: a shared task carries
 * both people's rows, and summing those would show your partner's hours as
 * yours. Days with nothing tracked are simply absent.
 */
export async function workedMinutesByDay(
  householdId: string,
  userId: string,
  start: string,
  end: string,
) {
  return db
    .select({
      day: taskTimeEntries.day,
      // numeric → string over the wire; the cast keeps the JSON a number.
      minutes: sql<number>`coalesce(sum(${taskTimeEntries.minutes}), 0)::float8`.mapWith(Number),
    })
    .from(taskTimeEntries)
    .where(
      and(
        eq(taskTimeEntries.household_id, householdId),
        eq(taskTimeEntries.user_id, userId),
        gte(taskTimeEntries.day, start),
        lte(taskTimeEntries.day, end),
      ),
    )
    .groupBy(taskTimeEntries.day)
    .orderBy(asc(taskTimeEntries.day));
}

/**
 * Minutes the user tracked on each task within [start, end], with the task's
 * category and estimate: one row per task. Resumen sums these per category and
 * pairs them with the estimate for "estimado vs real".
 *
 * Read from the per-day entries, not `tasks.actual_time_min` over the tasks
 * planned in range: that missed everything worked on a task planned another
 * day (or never planned), and credited the period with a task's lifetime total.
 *
 * Scoped by household AND user: tracked time is personal, and a shared task is
 * exactly where two people's minutes sit on the same row. The task and channel
 * joins repeat the household filter so a mismatched id can't pull a name from
 * another household.
 */
export async function trackedMinutesByTask(
  householdId: string,
  userId: string,
  start: string,
  end: string,
) {
  return db
    .select({
      task_id: taskTimeEntries.task_id,
      channel_id: tasks.channel_id,
      channel_name: channels.name,
      channel_color: channels.color,
      estimate_min: tasks.time_estimate_min,
      // numeric → string over the wire; the cast keeps the JSON a number.
      minutes: sql<number>`coalesce(sum(${taskTimeEntries.minutes}), 0)::float8`.mapWith(Number),
    })
    .from(taskTimeEntries)
    .innerJoin(
      tasks,
      and(
        eq(tasks.id, taskTimeEntries.task_id),
        eq(tasks.household_id, householdId),
        visibleTo(userId),
      ),
    )
    .leftJoin(
      channels,
      and(eq(channels.id, tasks.channel_id), eq(channels.household_id, householdId)),
    )
    .where(
      and(
        eq(taskTimeEntries.household_id, householdId),
        eq(taskTimeEntries.user_id, userId),
        gte(taskTimeEntries.day, start),
        lte(taskTimeEntries.day, end),
      ),
    )
    .groupBy(
      taskTimeEntries.task_id,
      tasks.channel_id,
      channels.name,
      channels.color,
      tasks.time_estimate_min,
    );
}

export async function setActiveSince(
  householdId: string,
  userId: string,
  taskId: string,
  active: boolean,
) {
  await db
    .update(tasks)
    .set({ active_since: active ? new Date().toISOString() : null })
    .where(scoped(householdId, userId, taskId));
}

export async function taskBlockCalendarEventIds(
  householdId: string,
  userId: string,
  taskId: string,
) {
  const rows = await db
    .select({ gcal_event_id: taskBlocks.gcal_event_id })
    .from(taskBlocks)
    .where(
      and(
        eq(taskBlocks.task_id, taskId),
        eq(taskBlocks.household_id, householdId),
        onVisibleTask(householdId, userId, taskBlocks.task_id),
      ),
    );
  return rows.map((r) => r.gcal_event_id).filter((id): id is string => !!id);
}

export async function deleteTaskBlocks(householdId: string, userId: string, taskId: string) {
  await db
    .delete(taskBlocks)
    .where(
      and(
        eq(taskBlocks.task_id, taskId),
        eq(taskBlocks.household_id, householdId),
        onVisibleTask(householdId, userId, taskBlocks.task_id),
      ),
    );
}

/**
 * Deletes a task — except a routine's instance, which is skipped instead.
 *
 * Routine instances are generated on demand by `ensure_day_materialized`,
 * which skips a day whose (template_id, template_date) slot is taken. Deleting
 * the row freed the slot, so the routine came straight back the next time the
 * day was opened. A skipped instance keeps the slot as a bare `cancelled` row
 * that every read hides; what hung off it (time, blocks, checklist, comments,
 * files) goes, the same as a delete.
 */
export async function deleteTask(householdId: string, userId: string, taskId: string) {
  const [task] = await db
    .select({ template_id: tasks.template_id, template_date: tasks.template_date })
    .from(tasks)
    .where(scoped(householdId, userId, taskId));
  if (!task) return;
  if (!task.template_id || !task.template_date) {
    await db.delete(tasks).where(scoped(householdId, userId, taskId));
    return;
  }
  await dbPool.transaction(async (tx) => {
    for (const child of [taskBlocks, subtasks, taskComments, taskReactions, taskAttachments]) {
      await tx.delete(child).where(eq(child.task_id, taskId));
    }
    await tx.delete(taskTimeEntries).where(eq(taskTimeEntries.task_id, taskId));
    await tx
      .update(tasks)
      .set({
        status: CANCELLED,
        actual_time_min: null,
        active_since: null,
        block_start: null,
        block_end: null,
        remind_at: null,
        completed_at: null,
      })
      .where(scoped(householdId, userId, taskId));
  });
}

/** `priority: undefined` leaves the column alone; `null` clears it. Dragging a
 *  card into another priority group moves and re-prioritizes it in one write. */
export async function moveTaskToDate(
  householdId: string,
  userId: string,
  taskId: string,
  /** null sends the task back to the backlog (no planned day). */
  toDate: string | null,
  sortOrder: number,
  priority?: PriorityKey,
) {
  if (toDate) await claimRoutineSlot(householdId, userId, taskId, toDate);
  await db
    .update(tasks)
    .set({
      planned_date: toDate,
      sort_order: sortOrder,
      block_start: null,
      block_end: null,
      ...(priority !== undefined && { priority }),
    })
    .where(scoped(householdId, userId, taskId));
}

/**
 * Moving a routine's instance onto another day the routine also runs on.
 *
 * Left alone, that day materialized its own instance on top of the moved one:
 * "do today's gym tomorrow" became two gyms tomorrow. So the moved instance
 * takes over the target day's slot (its `template_date` becomes that day), and
 * the day it left is held by a `cancelled` placeholder so it does not come
 * back there either — it was moved, not done. When the target day already
 * has its own instance, or the routine does not run that day, the instance
 * simply moves and keeps its slot, as before.
 *
 * One transaction: between freeing the old slot and placing the placeholder,
 * a materialization of the old day would otherwise slip a fresh copy in.
 */
async function claimRoutineSlot(
  householdId: string,
  userId: string,
  taskId: string,
  toDate: string,
) {
  const [row] = await db
    .select({
      task: { template_id: tasks.template_id, template_date: tasks.template_date },
      rule: {
        freq: recurringTemplates.freq,
        weekdays: recurringTemplates.weekdays,
        repeat_every: recurringTemplates.repeat_every,
        month_day: recurringTemplates.month_day,
        active_from: recurringTemplates.active_from,
        active_until: recurringTemplates.active_until,
        owner_id: recurringTemplates.owner_id,
        title: recurringTemplates.title,
      },
    })
    .from(tasks)
    .innerJoin(
      recurringTemplates,
      and(
        eq(recurringTemplates.id, tasks.template_id),
        eq(recurringTemplates.household_id, householdId),
      ),
    )
    .where(scoped(householdId, userId, taskId));
  if (!row?.task.template_id || !row.task.template_date) return;
  const { template_id: templateId, template_date: fromSlot } = row.task;
  if (fromSlot === toDate) return;
  if (row.rule.active_until && toDate > row.rule.active_until) return;
  if (!isExpectedOccurrence(row.rule, toDate)) return;

  await dbPool.transaction(async (tx) => {
    const claimed = await tx
      .update(tasks)
      .set({ template_date: toDate })
      .where(
        and(
          eq(tasks.id, taskId),
          sql`not exists (select 1 from "tasks" t2 where t2.template_id = ${templateId} and t2.template_date = ${toDate})`,
        ),
      )
      .returning({ id: tasks.id });
    if (claimed.length === 0) return;
    await tx
      .insert(tasks)
      .values({
        household_id: householdId,
        owner_id: row.rule.owner_id,
        created_by: row.rule.owner_id,
        title: row.rule.title,
        status: CANCELLED,
        planned_date: fromSlot,
        template_id: templateId,
        template_date: fromSlot,
      })
      .onConflictDoNothing();
  });
}

export async function reorderTask(
  householdId: string,
  userId: string,
  taskId: string,
  sortOrder: number,
  priority?: PriorityKey,
) {
  await db
    .update(tasks)
    .set({ sort_order: sortOrder, ...(priority !== undefined && { priority }) })
    .where(scoped(householdId, userId, taskId));
}
