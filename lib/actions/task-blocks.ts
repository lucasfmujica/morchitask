"use server";

import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/task-blocks";

export async function getBlocksForDate(date: string) {
  const { householdId } = await requireSession();
  return data.listForDate(householdId, date);
}

export async function createBlock(taskId: string, startISO: string, endISO: string) {
  const { householdId } = await requireWriteAccess();
  return data.createBlock(householdId, taskId, startISO, endISO);
}

export async function updateBlock(id: string, startISO: string, endISO: string) {
  const { householdId } = await requireWriteAccess();
  return data.updateBlock(householdId, id, startISO, endISO);
}

export async function deleteBlock(id: string) {
  const { householdId } = await requireWriteAccess();
  await data.deleteBlock(householdId, id);
}
