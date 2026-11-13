import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subtasks, tasks } from "@/lib/db/schema";
import { pickSubtaskPatch } from "@/lib/patches";
import { assertVisibleTask, isHouseholdMember, onVisibleTask, visibleTo } from "./visibility";

/** A checklist item is as private as its task: every read and write below also
 *  requires the parent task to be visible to the caller (see visibility.ts). */

export async function listForTask(householdId: string, userId: string, taskId: string) {
  return db
    .select()
    .from(subtasks)
    .where(
      and(
        eq(subtasks.household_id, householdId),
        eq(subtasks.task_id, taskId),
        onVisibleTask(householdId, userId, subtasks.task_id),
      ),
    )
    .orderBy(asc(subtasks.sort_order));
}

/** Every checklist item for the tasks this person sees on a given day, in one
 *  query. It used to check only the household, which listed the partner's
 *  private checklists by title. */
export async function listForDate(householdId: string, userId: string, date: string) {
  const rows = await db
    .select({ subtask: subtasks })
    .from(subtasks)
    .innerJoin(
      tasks,
      and(
        eq(subtasks.task_id, tasks.id),
        eq(tasks.household_id, householdId),
        visibleTo(userId),
        ne(tasks.status, "cancelled"),
      ),
    )
    .where(and(eq(subtasks.household_id, householdId), eq(tasks.planned_date, date)))
    .orderBy(asc(subtasks.sort_order));
  return rows.map((r) => r.subtask);
}

export async function createSubtask(
  householdId: string,
  userId: string,
  taskId: string,
  input: { title: string; sortOrder: number },
) {
  await assertVisibleTask(householdId, userId, taskId);
  const [row] = await db
    .insert(subtasks)
    .values({
      household_id: householdId,
      task_id: taskId,
      title: String(input.title),
      sort_order: Number.isFinite(input.sortOrder) ? input.sortOrder : 1000,
    })
    .returning();
  return row;
}

function scoped(householdId: string, userId: string, id: string) {
  return and(
    eq(subtasks.id, id),
    eq(subtasks.household_id, householdId),
    onVisibleTask(householdId, userId, subtasks.task_id),
  );
}

/** Only the title and the assignee, and an assignee has to be someone in this
 *  household. */
export async function updateSubtask(
  householdId: string,
  userId: string,
  id: string,
  patch: { title?: string; assignee_id?: string | null },
) {
  const clean = pickSubtaskPatch(patch);
  if (clean.assignee_id && !(await isHouseholdMember(householdId, clean.assignee_id))) {
    throw new Error("not a member");
  }
  if (Object.keys(clean).length === 0) return;
  await db
    .update(subtasks)
    .set(clean)
    .where(scoped(householdId, userId, id));
}

export async function toggleSubtask(
  householdId: string,
  userId: string,
  id: string,
  done: boolean,
) {
  await db
    .update(subtasks)
    .set({ done: done === true })
    .where(scoped(householdId, userId, id));
}

export async function deleteSubtask(householdId: string, userId: string, id: string) {
  await db.delete(subtasks).where(scoped(householdId, userId, id));
}
