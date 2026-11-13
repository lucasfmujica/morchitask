import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { taskReactions } from "@/lib/db/schema";
import { assertVisibleTask, onVisibleTask } from "./visibility";

/** Reactions are as private as their task (see visibility.ts). */

export async function listReactions(householdId: string, userId: string, taskId: string) {
  return db
    .select()
    .from(taskReactions)
    .where(
      and(
        eq(taskReactions.household_id, householdId),
        eq(taskReactions.task_id, taskId),
        onVisibleTask(householdId, userId, taskReactions.task_id),
      ),
    )
    .orderBy(asc(taskReactions.created_at));
}

export async function addReaction(
  householdId: string,
  taskId: string,
  authorId: string,
  emoji: string,
) {
  await assertVisibleTask(householdId, authorId, taskId);
  await db.insert(taskReactions).values({
    household_id: householdId,
    task_id: taskId,
    author_id: authorId,
    emoji: String(emoji),
  });
}

/** Only your own reaction. */
export async function removeReaction(householdId: string, userId: string, id: string) {
  await db
    .delete(taskReactions)
    .where(
      and(
        eq(taskReactions.id, id),
        eq(taskReactions.household_id, householdId),
        eq(taskReactions.author_id, userId),
        onVisibleTask(householdId, userId, taskReactions.task_id),
      ),
    );
}
