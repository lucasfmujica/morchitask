import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { taskReactions } from "@/lib/db/schema";

export async function listReactions(householdId: string, taskId: string) {
  return db
    .select()
    .from(taskReactions)
    .where(and(eq(taskReactions.household_id, householdId), eq(taskReactions.task_id, taskId)))
    .orderBy(asc(taskReactions.created_at));
}

export async function addReaction(
  householdId: string,
  taskId: string,
  authorId: string,
  emoji: string,
) {
  await db
    .insert(taskReactions)
    .values({ household_id: householdId, task_id: taskId, author_id: authorId, emoji });
}

export async function removeReaction(householdId: string, id: string) {
  await db
    .delete(taskReactions)
    .where(and(eq(taskReactions.id, id), eq(taskReactions.household_id, householdId)));
}
