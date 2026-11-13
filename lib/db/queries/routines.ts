import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db, dbPool } from "@/lib/db/client";
import { recurringTemplates, tasks } from "@/lib/db/schema";
import { pickRoutineInput } from "@/lib/patches";

export type RoutineInput = Partial<
  Pick<
    typeof recurringTemplates.$inferInsert,
    | "title"
    | "notes"
    | "freq"
    | "weekdays"
    | "repeat_every"
    | "month_day"
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

/** `input` comes from the browser: rebuilt from a whitelist, so it cannot
 *  name the household, the owner, the id or the timestamps. */
export async function createRoutine(householdId: string, ownerId: string, input: RoutineInput) {
  const clean = pickRoutineInput(input);
  if (typeof clean.title !== "string" || !clean.title.trim()) throw new Error("title required");
  const [row] = await db
    .insert(recurringTemplates)
    .values({
      freq: "weekly",
      active_from: new Date().toISOString().slice(0, 10),
      ...clean,
      title: clean.title,
      household_id: householdId,
      owner_id: ownerId,
    })
    .returning();
  return row;
}

/** Routines are personal (`listMyRoutines`), so only their owner changes them. */
function scoped(householdId: string, ownerId: string, id: string) {
  return and(
    eq(recurringTemplates.id, id),
    eq(recurringTemplates.household_id, householdId),
    eq(recurringTemplates.owner_id, ownerId),
  );
}

export async function updateRoutine(
  householdId: string,
  ownerId: string,
  id: string,
  patch: Partial<RoutineInput>,
) {
  const clean = pickRoutineInput(patch);
  if (Object.keys(clean).length === 0) return;
  await db
    .update(recurringTemplates)
    .set(clean)
    .where(scoped(householdId, ownerId, id));
}

/**
 * `tasks.template_id` references the routine without a cascade, so a routine
 * with any generated instance could not be deleted at all (the foreign key
 * refused it). Instances already made stay as ordinary tasks — they may hold
 * tracked time or be done — and the skipped placeholders (see `deleteTask`)
 * go, since they only existed to hold the routine's slots.
 */
export async function deleteRoutine(householdId: string, ownerId: string, id: string) {
  await dbPool.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: recurringTemplates.id })
      .from(recurringTemplates)
      .where(scoped(householdId, ownerId, id));
    if (!owned) return;
    await tx
      .delete(tasks)
      .where(
        and(
          eq(tasks.household_id, householdId),
          eq(tasks.template_id, id),
          eq(tasks.status, "cancelled"),
        ),
      );
    await tx
      .update(tasks)
      .set({ template_id: null, template_date: null })
      .where(and(eq(tasks.household_id, householdId), eq(tasks.template_id, id)));
    await tx.delete(recurringTemplates).where(scoped(householdId, ownerId, id));
  });
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
