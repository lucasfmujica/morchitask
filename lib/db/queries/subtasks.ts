import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subtasks, tasks } from "@/lib/db/schema";

export async function listForTask(householdId: string, taskId: string) {
  return db
    .select()
    .from(subtasks)
    .where(and(eq(subtasks.household_id, householdId), eq(subtasks.task_id, taskId)))
    .orderBy(asc(subtasks.sort_order));
}

/** Every checklist item for tasks planned on a given day, in one query. */
export async function listForDate(householdId: string, date: string) {
  const rows = await db
    .select({ subtask: subtasks })
    .from(subtasks)
    .innerJoin(tasks, eq(subtasks.task_id, tasks.id))
    .where(and(eq(subtasks.household_id, householdId), eq(tasks.planned_date, date)))
    .orderBy(asc(subtasks.sort_order));
  return rows.map((r) => r.subtask);
}

export async function createSubtask(
  householdId: string,
  taskId: string,
  input: { title: string; sortOrder: number },
) {
  const [row] = await db
    .insert(subtasks)
    .values({
      household_id: householdId,
      task_id: taskId,
      title: input.title,
      sort_order: input.sortOrder,
    })
    .returning();
  return row;
}

function scoped(householdId: string, id: string) {
  return and(eq(subtasks.id, id), eq(subtasks.household_id, householdId));
}

export async function updateSubtask(
  householdId: string,
  id: string,
  patch: { title?: string; assignee_id?: string | null },
) {
  await db.update(subtasks).set(patch).where(scoped(householdId, id));
}

export async function toggleSubtask(householdId: string, id: string, done: boolean) {
  await db.update(subtasks).set({ done }).where(scoped(householdId, id));
}

export async function deleteSubtask(householdId: string, id: string) {
  await db.delete(subtasks).where(scoped(householdId, id));
}
