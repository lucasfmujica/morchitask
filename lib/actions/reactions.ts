"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/reactions";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

export async function getReactions(taskId: string) {
  const { householdId } = await requireSession();
  return data.listReactions(householdId, taskId);
}

export async function addReaction(taskId: string, emoji: string) {
  const { householdId, userId } = await requireSession();
  await data.addReaction(householdId, taskId, userId, emoji);
}

export async function removeReaction(id: string) {
  const { householdId } = await requireSession();
  await data.removeReaction(householdId, id);
}
