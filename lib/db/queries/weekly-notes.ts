import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { weeklyNotes } from "@/lib/db/schema";
import { pickWeeklyNotePatch } from "@/lib/patches";

export type WeeklyNotePatch = Partial<
  Pick<typeof weeklyNotes.$inferInsert, "wins" | "lessons" | "next_focus" | "completed_at">
>;

export async function getWeeklyNote(ownerId: string, weekStart: string) {
  const [row] = await db
    .select()
    .from(weeklyNotes)
    .where(and(eq(weeklyNotes.owner_id, ownerId), eq(weeklyNotes.week_start, weekStart)));
  return row ?? null;
}

export async function upsertWeeklyNote(
  householdId: string,
  ownerId: string,
  weekStart: string,
  patch: WeeklyNotePatch,
) {
  // Whitelisted and spread before the owner — see upsertDailyNote.
  const clean = pickWeeklyNotePatch(patch);
  const [row] = await db
    .insert(weeklyNotes)
    .values({ ...clean, household_id: householdId, owner_id: ownerId, week_start: weekStart })
    .onConflictDoUpdate({
      target: [weeklyNotes.owner_id, weeklyNotes.week_start],
      set: Object.keys(clean).length > 0 ? clean : { updated_at: sql`now()` },
      setWhere: eq(weeklyNotes.household_id, householdId),
    })
    .returning();
  return row;
}
