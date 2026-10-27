"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/weekly-notes";
import type { WeeklyNotePatch } from "@/lib/db/queries/weekly-notes";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

export async function getWeeklyNote(weekStart: string) {
  const session = await auth();
  if (!session?.user.id) return null;
  return data.getWeeklyNote(session.user.id, weekStart);
}

export async function upsertWeeklyNote(weekStart: string, patch: WeeklyNotePatch) {
  const { householdId, userId } = await requireSession();
  return data.upsertWeeklyNote(householdId, userId, weekStart, patch);
}
