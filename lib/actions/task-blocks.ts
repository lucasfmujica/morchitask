"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/task-blocks";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId };
}

export async function getBlocksForDate(date: string) {
  const { householdId } = await requireSession();
  return data.listForDate(householdId, date);
}

export async function createBlock(taskId: string, startISO: string, endISO: string) {
  const { householdId } = await requireSession();
  return data.createBlock(householdId, taskId, startISO, endISO);
}

export async function updateBlock(id: string, startISO: string, endISO: string) {
  const { householdId } = await requireSession();
  return data.updateBlock(householdId, id, startISO, endISO);
}

export async function deleteBlock(id: string) {
  const { householdId } = await requireSession();
  await data.deleteBlock(householdId, id);
}
