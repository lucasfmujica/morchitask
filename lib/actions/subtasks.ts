"use server";

import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/subtasks";

export async function getSubtasksForTask(taskId: string) {
  const { householdId } = await requireSession();
  return data.listForTask(householdId, taskId);
}

export async function getSubtasksForDate(date: string) {
  const { householdId } = await requireSession();
  return data.listForDate(householdId, date);
}

export async function createSubtask(taskId: string, input: { title: string; sortOrder: number }) {
  const { householdId } = await requireWriteAccess();
  return data.createSubtask(householdId, taskId, input);
}

export async function updateSubtask(
  id: string,
  patch: { title?: string; assignee_id?: string | null },
) {
  const { householdId } = await requireWriteAccess();
  await data.updateSubtask(householdId, id, patch);
}

export async function toggleSubtask(id: string, done: boolean) {
  const { householdId } = await requireWriteAccess();
  await data.toggleSubtask(householdId, id, done);
}

export async function deleteSubtask(id: string) {
  const { householdId } = await requireWriteAccess();
  await data.deleteSubtask(householdId, id);
}
