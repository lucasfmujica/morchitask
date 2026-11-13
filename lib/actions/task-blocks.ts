"use server";

import { after } from "next/server";
import { deleteCalendarEvents } from "@/lib/google-calendar";
import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/task-blocks";

export async function getBlocksForDate(date: string) {
  const { householdId, userId } = await requireSession();
  return data.listForDate(householdId, userId, date);
}

export async function createBlock(taskId: string, startISO: string, endISO: string) {
  const { householdId, userId } = await requireWriteAccess();
  return data.createBlock(householdId, userId, taskId, startISO, endISO);
}

export async function updateBlock(id: string, startISO: string, endISO: string) {
  const { householdId, userId } = await requireWriteAccess();
  return data.updateBlock(householdId, userId, id, startISO, endISO);
}

/** Deletes the block, and afterwards its Google Calendar event, if it had one.
 *  The event id comes off our own row, never from the browser. */
export async function deleteBlock(id: string) {
  const { householdId, userId } = await requireWriteAccess();
  const eventId = await data.deleteBlock(householdId, userId, id);
  if (eventId) after(() => deleteCalendarEvents(userId, [eventId]));
}
