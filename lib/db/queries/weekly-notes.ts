import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { weeklyNotes } from "@/lib/db/schema";

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
  const [row] = await db
    .insert(weeklyNotes)
    .values({ household_id: householdId, owner_id: ownerId, week_start: weekStart, ...patch })
    .onConflictDoUpdate({
      target: [weeklyNotes.owner_id, weeklyNotes.week_start],
      set: patch,
    })
    .returning();
  return row;
}
