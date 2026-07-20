import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { taskComments } from "@/lib/db/schema";

export async function listComments(householdId: string, taskId: string) {
  return db
    .select()
    .from(taskComments)
    .where(and(eq(taskComments.household_id, householdId), eq(taskComments.task_id, taskId)))
    .orderBy(asc(taskComments.created_at));
}

export async function addComment(
  householdId: string,
  taskId: string,
  authorId: string,
  body: string,
) {
  const [row] = await db
    .insert(taskComments)
    .values({ household_id: householdId, task_id: taskId, author_id: authorId, body })
    .returning();
  return row;
}

export async function deleteComment(householdId: string, id: string) {
  await db
    .delete(taskComments)
    .where(and(eq(taskComments.id, id), eq(taskComments.household_id, householdId)));
}
