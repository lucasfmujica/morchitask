"use server";

import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/subtasks";

export async function getSubtasksForTask(taskId: string) {
  const { householdId, userId } = await requireSession();
  return data.listForTask(householdId, userId, taskId);
}

export async function getSubtasksForDate(date: string) {
  const { householdId, userId } = await requireSession();
  return data.listForDate(householdId, userId, date);
}

export async function createSubtask(taskId: string, input: { title: string; sortOrder: number }) {
  const { householdId, userId } = await requireWriteAccess();
  return data.createSubtask(householdId, userId, taskId, input);
}

/** `patch` is untyped JSON: the data layer keeps only the title and assignee. */
export async function updateSubtask(
  id: string,
  patch: { title?: string; assignee_id?: string | null },
) {
  const { householdId, userId } = await requireWriteAccess();
  await data.updateSubtask(householdId, userId, id, patch);
}

export async function toggleSubtask(id: string, done: boolean) {
  const { householdId, userId } = await requireWriteAccess();
  await data.toggleSubtask(householdId, userId, id, done);
}

export async function deleteSubtask(id: string) {
  const { householdId, userId } = await requireWriteAccess();
  await data.deleteSubtask(householdId, userId, id);
}
