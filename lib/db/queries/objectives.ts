import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { objectives, tasks } from "@/lib/db/schema";
import { pickObjectiveInput, pickObjectivePatch } from "@/lib/patches";
import { myActualMinutes, visibleTo } from "./visibility";

/**
 * Goals ("Metas") are personal, like categories and routines: the screen
 * says "tus objetivos", every goal has an `owner_id`, and account deletion
 * already treats them as the owner's alone. They used to be listed, edited
 * and deleted household-wide, so one person could rename or delete the
 * other's goals. Now every read and write is scoped to the owner.
 */

export async function listObjectives(householdId: string, ownerId: string) {
  return db
    .select()
    .from(objectives)
    .where(
      and(
        eq(objectives.household_id, householdId),
        eq(objectives.owner_id, ownerId),
        ne(objectives.status, "archived"),
      ),
    )
    .orderBy(asc(objectives.end_date), asc(objectives.sort_order));
}

/**
 * The tasks linked to the caller's goals, for the progress bars. Only tasks
 * the caller can see (a goal of yours does not get to count the partner's
 * private tasks), and only the caller's own minutes on each.
 */
export async function objectiveTaskCounts(householdId: string, userId: string) {
  return (
    db
      // actual_time_min rides along so the goal can show the hours it actually
      // absorbed, not just a task count — an 8-task goal and a 20-hour goal are
      // very different commitments.
      .select({
        objective_id: tasks.objective_id,
        status: tasks.status,
        actual_time_min: myActualMinutes(userId),
      })
      .from(tasks)
      .innerJoin(
        objectives,
        and(
          eq(objectives.id, tasks.objective_id),
          eq(objectives.household_id, householdId),
          eq(objectives.owner_id, userId),
        ),
      )
      .where(
        and(
          eq(tasks.household_id, householdId),
          isNotNull(tasks.objective_id),
          visibleTo(userId),
          ne(tasks.status, "cancelled"),
        ),
      )
  );
}

export async function createObjective(
  householdId: string,
  ownerId: string,
  input: { title: string; period: string; start_date: string; end_date: string },
) {
  const clean = pickObjectiveInput(input);
  if (!clean.title || !clean.start_date || !clean.end_date) throw new Error("invalid goal");
  const [row] = await db
    .insert(objectives)
    .values({
      household_id: householdId,
      owner_id: ownerId,
      title: clean.title,
      period: clean.period ?? "week",
      start_date: clean.start_date,
      end_date: clean.end_date,
    })
    .returning();
  return row;
}

function scoped(householdId: string, ownerId: string, id: string) {
  return and(
    eq(objectives.id, id),
    eq(objectives.household_id, householdId),
    eq(objectives.owner_id, ownerId),
  );
}

export async function updateObjective(
  householdId: string,
  ownerId: string,
  id: string,
  patch: { title?: string; status?: string; sort_order?: number },
) {
  const clean = pickObjectivePatch(patch);
  if (Object.keys(clean).length === 0) return;
  await db
    .update(objectives)
    .set(clean)
    .where(scoped(householdId, ownerId, id));
}

export async function deleteObjective(householdId: string, ownerId: string, id: string) {
  await db.delete(objectives).where(scoped(householdId, ownerId, id));
}
