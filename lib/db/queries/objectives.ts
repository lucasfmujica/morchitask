import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { objectives, tasks } from "@/lib/db/schema";

export async function listObjectives(householdId: string) {
  return db
    .select()
    .from(objectives)
    .where(and(eq(objectives.household_id, householdId), ne(objectives.status, "archived")))
    .orderBy(asc(objectives.end_date), asc(objectives.sort_order));
}

export async function objectiveTaskCounts(householdId: string) {
  return db
    .select({ objective_id: tasks.objective_id, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.household_id, householdId), isNotNull(tasks.objective_id)));
}

export async function createObjective(
  householdId: string,
  ownerId: string,
  input: { title: string; period: string; start_date: string; end_date: string },
) {
  const [row] = await db
    .insert(objectives)
    .values({ household_id: householdId, owner_id: ownerId, ...input })
    .returning();
  return row;
}

function scoped(householdId: string, id: string) {
  return and(eq(objectives.id, id), eq(objectives.household_id, householdId));
}

export async function updateObjective(
  householdId: string,
  id: string,
  patch: { title?: string; status?: string; sort_order?: number },
) {
  await db.update(objectives).set(patch).where(scoped(householdId, id));
}

export async function deleteObjective(householdId: string, id: string) {
  await db.delete(objectives).where(scoped(householdId, id));
}
