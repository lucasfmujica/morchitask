"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/daily-notes";
import type { DailyNotePatch } from "@/lib/db/queries/daily-notes";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

export async function getDailyNote(date: string) {
  const session = await auth();
  if (!session?.user.id) return null;
  return data.getDailyNote(session.user.id, date);
}

export async function upsertDailyNote(date: string, patch: DailyNotePatch) {
  const { householdId, userId } = await requireSession();
  return data.upsertDailyNote(householdId, userId, date, patch);
}

export async function rolloverIncomplete(from: string, to: string) {
  const { userId } = await requireSession();
  return data.rolloverIncomplete(userId, from, to);
}
