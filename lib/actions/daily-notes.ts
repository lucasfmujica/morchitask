"use server";

import { auth } from "@/lib/auth";
import { requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/daily-notes";
import type { DailyNotePatch } from "@/lib/db/queries/daily-notes";

export async function getDailyNote(date: string) {
  const session = await auth();
  if (!session?.user.id) return null;
  return data.getDailyNote(session.user.id, date);
}

export async function getShutdownDays(from: string, to: string) {
  const session = await auth();
  if (!session?.user.id) return [];
  return data.getShutdownDays(session.user.id, from, to);
}

export async function upsertDailyNote(date: string, patch: DailyNotePatch) {
  const { householdId, userId } = await requireWriteAccess();
  return data.upsertDailyNote(householdId, userId, date, patch);
}

export async function rolloverIncomplete(from: string, to: string) {
  const { userId } = await requireWriteAccess();
  return data.rolloverIncomplete(userId, from, to);
}
