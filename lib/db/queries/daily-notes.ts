import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dailyNotes } from "@/lib/db/schema";

export type DailyNotePatch = Partial<
  Pick<
    typeof dailyNotes.$inferInsert,
    | "intention"
    | "reflection"
    | "mood"
    | "capacity_min"
    | "end_target_min"
    | "plan_completed_at"
    | "shutdown_completed_at"
  >
>;

export async function getDailyNote(ownerId: string, date: string) {
  const [row] = await db
    .select()
    .from(dailyNotes)
    .where(and(eq(dailyNotes.owner_id, ownerId), eq(dailyNotes.note_date, date)));
  return row ?? null;
}

export async function upsertDailyNote(
  householdId: string,
  ownerId: string,
  date: string,
  patch: DailyNotePatch,
) {
  const [row] = await db
    .insert(dailyNotes)
    .values({ household_id: householdId, owner_id: ownerId, note_date: date, ...patch })
    .onConflictDoUpdate({
      target: [dailyNotes.owner_id, dailyNotes.note_date],
      set: patch,
    })
    .returning();
  return row;
}

/**
 * Moves the caller's unfinished (non-routine) tasks between days. Calls the
 * `rollover_incomplete` Postgres function (drizzle/migrations/0001), ported
 * from Supabase. The Supabase version relied on `auth.uid()`; the Neon port
 * takes `owner_id` explicitly since there's no session context in plain SQL.
 */
export async function rolloverIncomplete(ownerId: string, from: string, to: string) {
  const result = await db.execute(
    sql`select rollover_incomplete(${ownerId}::uuid, ${from}::date, ${to}::date) as count`,
  );
  return Number(result.rows[0]?.count ?? 0);
}
