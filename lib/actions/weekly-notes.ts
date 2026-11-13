"use server";

import { auth } from "@/lib/auth";
import { requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/weekly-notes";
import type { WeeklyNotePatch } from "@/lib/db/queries/weekly-notes";

export async function getWeeklyNote(weekStart: string) {
  const session = await auth();
  if (!session?.user.id) return null;
  return data.getWeeklyNote(session.user.id, weekStart);
}

/** Gated like the daily notes: the weekly review is planning, and it was the
 *  one planning write that still only checked for a session. */
export async function upsertWeeklyNote(weekStart: string, patch: WeeklyNotePatch) {
  const { householdId, userId } = await requireWriteAccess();
  return data.upsertWeeklyNote(householdId, userId, weekStart, patch);
}
