"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/comments";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

export async function getComments(taskId: string) {
  const { householdId } = await requireSession();
  return data.listComments(householdId, taskId);
}

export async function addComment(taskId: string, body: string) {
  const { householdId, userId } = await requireSession();
  return data.addComment(householdId, taskId, userId, body);
}

export async function deleteComment(id: string) {
  const { householdId } = await requireSession();
  await data.deleteComment(householdId, id);
}
