"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/tasks";
import { isTaskPriority, type PriorityKey } from "@/lib/priority";
import type { NewTask, TaskPatch } from "@/lib/queries/types";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

/** The patch reaches `db.update().set()` verbatim, so reject a bogus priority
 *  here rather than relying on the CHECK constraint to raise a 500. */
function assertPriority(priority: PriorityKey | undefined) {
  if (priority !== undefined && priority !== null && !isTaskPriority(priority)) {
    throw new Error("invalid priority");
  }
}

export async function createTask(input: NewTask) {
  const { householdId, userId } = await requireSession();
  assertPriority(input.priority);
  return data.insertTask(householdId, userId, input);
}

export async function toggleTask(taskId: string, done: boolean) {
  const { householdId } = await requireSession();
  return data.toggleTaskDone(householdId, taskId, done);
}

export async function updateTask(taskId: string, patch: TaskPatch) {
  const { householdId } = await requireSession();
  assertPriority(patch.priority);
  return data.updateTask(householdId, taskId, patch);
}

export async function setActualTime(taskId: string, actualMin: number) {
  const { householdId } = await requireSession();
  await data.setActualTime(householdId, taskId, actualMin);
}

export async function addActualTime(taskId: string, deltaMin: number) {
  const { householdId } = await requireSession();
  await data.addActualTime(householdId, taskId, deltaMin);
}

export async function setTaskActiveSince(taskId: string, active: boolean) {
  const { householdId } = await requireSession();
  await data.setActiveSince(householdId, taskId, active);
}

/** Deletes the task and returns the Google Calendar event ids its blocks had,
 * so the client can clean them up (calendar sync stays client-side until
 * the edge functions are ported — see migration plan Fase 4). */
export async function deleteTask(taskId: string) {
  const { householdId } = await requireSession();
  const eventIds = await data.taskBlockCalendarEventIds(householdId, taskId);
  await data.deleteTask(householdId, taskId);
  return { eventIds };
}

export async function moveTaskToDate(
  taskId: string,
  toDate: string,
  sortOrder: number,
  priority?: PriorityKey,
) {
  const { householdId } = await requireSession();
  assertPriority(priority);
  const eventIds = await data.taskBlockCalendarEventIds(householdId, taskId);
  await data.deleteTaskBlocks(householdId, taskId);
  await data.moveTaskToDate(householdId, taskId, toDate, sortOrder, priority);
  return { eventIds };
}

export async function reorderTask(taskId: string, sortOrder: number, priority?: PriorityKey) {
  const { householdId } = await requireSession();
  assertPriority(priority);
  await data.reorderTask(householdId, taskId, sortOrder, priority);
}
