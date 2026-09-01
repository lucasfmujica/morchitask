"use server";

import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/comments";

export async function getComments(taskId: string) {
  const { householdId } = await requireSession();
  return data.listComments(householdId, taskId);
}

export async function addComment(taskId: string, body: string) {
  const { householdId, userId } = await requireWriteAccess();
  return data.addComment(householdId, taskId, userId, body);
}

export async function deleteComment(id: string) {
  const { householdId } = await requireWriteAccess();
  await data.deleteComment(householdId, id);
}
