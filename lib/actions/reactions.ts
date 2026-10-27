"use server";

import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/reactions";

export async function getReactions(taskId: string) {
  const { householdId } = await requireSession();
  return data.listReactions(householdId, taskId);
}

export async function addReaction(taskId: string, emoji: string) {
  const { householdId, userId } = await requireWriteAccess();
  await data.addReaction(householdId, taskId, userId, emoji);
}

export async function removeReaction(id: string) {
  const { householdId } = await requireWriteAccess();
  await data.removeReaction(householdId, id);
}
