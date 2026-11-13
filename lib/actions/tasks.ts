"use server";

import { after } from "next/server";
import { del } from "@vercel/blob";
import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import * as attachments from "@/lib/db/queries/attachments";
import * as data from "@/lib/db/queries/tasks";
import { isTaskPriority, type PriorityKey } from "@/lib/priority";
import type { NewTask, TaskPatch } from "@/lib/queries/types";
import { deleteCalendarEvents } from "@/lib/google-calendar";
import { pushToStint } from "@/lib/stint-sync";

/** The patch reaches `db.update().set()` verbatim, so reject a bogus priority
 *  here rather than relying on the CHECK constraint to raise a 500. */
function assertPriority(priority: PriorityKey | undefined) {
  if (priority !== undefined && priority !== null && !isTaskPriority(priority)) {
    throw new Error("invalid priority");
  }
}

export async function createTask(input: NewTask) {
  const { householdId, userId } = await requireWriteAccess();
  assertPriority(input.priority);
  return data.insertTask(householdId, userId, input);
}

export async function toggleTask(taskId: string, done: boolean) {
  const { householdId, userId } = await requireWriteAccess();
  const row = await data.toggleTaskDone(householdId, userId, taskId, done);
  // A task mirrored from Stint gets finished (or reopened) there too, after
  // the response: Stint being slow must not slow down the checkbox.
  if (row.stint_task_id)
    after(() => pushToStint(householdId, userId, taskId, done ? "done" : "undone"));
  return row;
}

/**
 * `patch` is untyped JSON from the browser: the data layer rebuilds it from a
 * whitelist. "Real" rides along in the same patch from the detail sheet, but
 * it is personal time, so it takes its own path (`setActualTime`).
 */
export async function updateTask(taskId: string, patch: TaskPatch) {
  const { householdId, userId } = await requireWriteAccess();
  assertPriority(patch?.priority);
  if (patch && "actual_time_min" in patch) {
    const actual = patch.actual_time_min;
    if (actual !== null && !(typeof actual === "number" && Number.isFinite(actual))) {
      throw new Error("invalid time");
    }
    await data.setActualTime(householdId, userId, taskId, actual);
  }
  return data.updateTask(householdId, userId, taskId, patch);
}

export async function setActualTime(taskId: string, actualMin: number) {
  const { householdId, userId } = await requireWriteAccess();
  if (!Number.isFinite(actualMin)) throw new Error("invalid time");
  await data.setActualTime(householdId, userId, taskId, actualMin);
}

/**
 * Log a stopwatch run, already split into per-day segments by the client (only
 * the browser knows which calendar days the run touched in the user's own
 * timezone). Attributed to whoever is signed in, so a shared task shows who put
 * in what.
 */
export async function logTaskTime(taskId: string, segments: { day: string; minutes: number }[]) {
  const { householdId, userId } = await requireWriteAccess();
  const clean = segments.filter(
    (s) => /^\d{4}-\d{2}-\d{2}$/.test(s.day) && Number.isFinite(s.minutes) && s.minutes > 0,
  );
  await data.logTaskTime(householdId, userId, taskId, clean);
}

/** Correct by hand how long *I* worked on a task on one day. */
export async function setTaskDayTime(taskId: string, day: string, minutes: number) {
  const { householdId, userId } = await requireWriteAccess();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("invalid day");
  // Same 24h ceiling the duration parser uses — a day can't hold more.
  const clean = Number.isFinite(minutes) ? Math.min(Math.max(minutes, 0), 24 * 60) : 0;
  await data.setTaskDayTime(householdId, userId, taskId, day, clean);
}

/** The day-by-day breakdown behind a task's total tracked time. */
export async function getTaskTimeEntries(taskId: string) {
  const { householdId, userId } = await requireSession();
  return data.timeEntriesForTask(householdId, userId, taskId);
}

export async function setTaskActiveSince(taskId: string, active: boolean) {
  const { householdId, userId } = await requireWriteAccess();
  await data.setActiveSince(householdId, userId, taskId, active);
  // Starting the stopwatch on a Stint task moves it to "doing" there.
  if (active) after(() => pushToStint(householdId, userId, taskId, "timerStarted"));
}

/** Deletes the task, and afterwards the Google Calendar events its blocks had.
 * The event ids are read from this household's block rows before they go, so
 * only events this app created can be deleted (see `deleteCalendarEvents`). */
export async function deleteTask(taskId: string) {
  const { householdId, userId } = await requireWriteAccess();
  const eventIds = await data.taskBlockCalendarEventIds(householdId, userId, taskId);
  // Attachment rows cascade with the task, but the stored files don't — read
  // their paths while the rows still exist, then delete the blobs afterwards.
  const attachmentPaths = await attachments.taskAttachmentPaths(householdId, userId, taskId);
  await data.deleteTask(householdId, userId, taskId);
  if (attachmentPaths.length > 0) {
    // Best effort, like every other blob delete: the task is already gone, and
    // a leftover file costs storage but is unreachable from the app.
    try {
      await del(attachmentPaths);
    } catch {
      // ignore
    }
  }
  if (eventIds.length > 0) after(() => deleteCalendarEvents(userId, eventIds));
}

export async function moveTaskToDate(
  taskId: string,
  toDate: string | null,
  sortOrder: number,
  priority?: PriorityKey,
) {
  const { householdId, userId } = await requireWriteAccess();
  assertPriority(priority);
  const eventIds = await data.taskBlockCalendarEventIds(householdId, userId, taskId);
  await data.deleteTaskBlocks(householdId, userId, taskId);
  await data.moveTaskToDate(householdId, userId, taskId, toDate, sortOrder, priority);
  if (eventIds.length > 0) after(() => deleteCalendarEvents(userId, eventIds));
}

export async function reorderTask(taskId: string, sortOrder: number, priority?: PriorityKey) {
  const { householdId, userId } = await requireWriteAccess();
  assertPriority(priority);
  await data.reorderTask(householdId, userId, taskId, sortOrder, priority);
}
