import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { taskComments } from "@/lib/db/schema";
import { assertVisibleTask, onVisibleTask } from "./visibility";

/** Comments are as private as their task (see visibility.ts). */

export async function listComments(householdId: string, userId: string, taskId: string) {
  return db
    .select()
    .from(taskComments)
    .where(
      and(
        eq(taskComments.household_id, householdId),
        eq(taskComments.task_id, taskId),
        onVisibleTask(householdId, userId, taskComments.task_id),
      ),
    )
    .orderBy(asc(taskComments.created_at));
}

export async function addComment(
  householdId: string,
  taskId: string,
  authorId: string,
  body: string,
) {
  await assertVisibleTask(householdId, authorId, taskId);
  const [row] = await db
    .insert(taskComments)
    .values({ household_id: householdId, task_id: taskId, author_id: authorId, body: String(body) })
    .returning();
  return row;
}

/** Only your own comment — the screen only ever offers that one. */
export async function deleteComment(householdId: string, userId: string, id: string) {
  await db
    .delete(taskComments)
    .where(
      and(
        eq(taskComments.id, id),
        eq(taskComments.household_id, householdId),
        eq(taskComments.author_id, userId),
        onVisibleTask(householdId, userId, taskComments.task_id),
      ),
    );
}
