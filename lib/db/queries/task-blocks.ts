import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { taskBlocks, tasks } from "@/lib/db/schema";

export async function listForDate(householdId: string, date: string) {
  const rows = await db
    .select({ block: taskBlocks })
    .from(taskBlocks)
    .innerJoin(tasks, eq(taskBlocks.task_id, tasks.id))
    .where(and(eq(taskBlocks.household_id, householdId), eq(tasks.planned_date, date)))
    .orderBy(asc(taskBlocks.start_at));
  return rows.map((r) => r.block);
}

export async function createBlock(
  householdId: string,
  taskId: string,
  startISO: string,
  endISO: string,
) {
  const [row] = await db
    .insert(taskBlocks)
    .values({ household_id: householdId, task_id: taskId, start_at: startISO, end_at: endISO })
    .returning();
  return row;
}

function scoped(householdId: string, id: string) {
  return and(eq(taskBlocks.id, id), eq(taskBlocks.household_id, householdId));
}

export async function updateBlock(
  householdId: string,
  id: string,
  startISO: string,
  endISO: string,
) {
  const [row] = await db
    .update(taskBlocks)
    .set({ start_at: startISO, end_at: endISO })
    .where(scoped(householdId, id))
    .returning();
  if (!row) throw new Error("block not found");
  return row;
}

export async function deleteBlock(householdId: string, id: string) {
  await db.delete(taskBlocks).where(scoped(householdId, id));
}

/** A block plus its parent task's title/sharing info, for Google Calendar sync. */
export async function blockForCalendarSync(householdId: string, blockId: string) {
  const [row] = await db
    .select({
      id: taskBlocks.id,
      start_at: taskBlocks.start_at,
      end_at: taskBlocks.end_at,
      gcal_event_id: taskBlocks.gcal_event_id,
      title: tasks.title,
      shared: tasks.shared,
    })
    .from(taskBlocks)
    .innerJoin(tasks, eq(taskBlocks.task_id, tasks.id))
    .where(scoped(householdId, blockId));
  return row ?? null;
}

export async function setBlockCalendarEvent(householdId: string, id: string, eventId: string) {
  await db
    .update(taskBlocks)
    .set({ gcal_event_id: eventId, gcal_synced_at: new Date().toISOString() })
    .where(scoped(householdId, id));
}
