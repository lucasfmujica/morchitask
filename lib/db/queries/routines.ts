import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { recurringTemplates, tasks } from "@/lib/db/schema";

export type RoutineInput = Partial<
  Pick<
    typeof recurringTemplates.$inferInsert,
    | "title"
    | "notes"
    | "freq"
    | "weekdays"
    | "time_estimate_min"
    | "active_from"
    | "active_until"
    | "channel_id"
    | "paused"
  >
> & { title: string };

export async function listMyRoutines(householdId: string, ownerId: string) {
  return db
    .select()
    .from(recurringTemplates)
    .where(
      and(
        eq(recurringTemplates.household_id, householdId),
        eq(recurringTemplates.owner_id, ownerId),
      ),
    )
    .orderBy(asc(recurringTemplates.created_at));
}

export async function createRoutine(householdId: string, ownerId: string, input: RoutineInput) {
  const [row] = await db
    .insert(recurringTemplates)
    .values({
      household_id: householdId,
      owner_id: ownerId,
      freq: "weekly",
      active_from: new Date().toISOString().slice(0, 10),
      ...input,
    })
    .returning();
  return row;
}

function scoped(householdId: string, id: string) {
  return and(eq(recurringTemplates.id, id), eq(recurringTemplates.household_id, householdId));
}

export async function updateRoutine(householdId: string, id: string, patch: Partial<RoutineInput>) {
  await db.update(recurringTemplates).set(patch).where(scoped(householdId, id));
}

export async function deleteRoutine(householdId: string, id: string) {
  await db.delete(recurringTemplates).where(scoped(householdId, id));
}

/** Completed routine-instance dates over the last ~90 days, for streaks. */
export async function routineStreaks(householdId: string, ownerId: string, since: string) {
  return db
    .select({
      template_id: tasks.template_id,
      template_date: tasks.template_date,
      status: tasks.status,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.household_id, householdId),
        eq(tasks.owner_id, ownerId),
        isNotNull(tasks.template_id),
        gte(tasks.template_date, since),
      ),
    );
}

/** Generate this day's routine instances (idempotent). */
export async function ensureDayMaterialized(householdId: string, ownerId: string, date: string) {
  await db.execute(
    sql`select ensure_day_materialized(${date}::date, ${householdId}::uuid, ${ownerId}::uuid)`,
  );
}
