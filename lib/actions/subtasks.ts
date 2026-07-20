"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/subtasks";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId };
}

export async function getSubtasksForTask(taskId: string) {
  const { householdId } = await requireSession();
  return data.listForTask(householdId, taskId);
}

export async function getSubtasksForDate(date: string) {
  const { householdId } = await requireSession();
  return data.listForDate(householdId, date);
}

export async function createSubtask(taskId: string, input: { title: string; sortOrder: number }) {
  const { householdId } = await requireSession();
  return data.createSubtask(householdId, taskId, input);
}

export async function updateSubtask(
  id: string,
  patch: { title?: string; assignee_id?: string | null },
) {
  const { householdId } = await requireSession();
  await data.updateSubtask(householdId, id, patch);
}

export async function toggleSubtask(id: string, done: boolean) {
  const { householdId } = await requireSession();
  await data.toggleSubtask(householdId, id, done);
}

export async function deleteSubtask(id: string) {
  const { householdId } = await requireSession();
  await data.deleteSubtask(householdId, id);
}
