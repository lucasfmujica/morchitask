import { and, eq, gt, isNull, sql, type AnyColumn } from "drizzle-orm";
import { dbPool } from "@/lib/db/client";
import { profiles, taskBlocks, tasks } from "@/lib/db/schema";

/**
 * Moves a person to another timezone, keeping their plans on the same clock.
 *
 * A block is stored as an instant, so changing only the zone would slide every
 * planned hour: the 10:00 task of someone who flew from Buenos Aires to Madrid
 * would turn up at 14:00. What they planned was "at ten", so everything of
 * theirs that has not happened yet is rewritten to the same wall-clock time in
 * the new zone: their open tasks' blocks and their own pending reminders.
 * What already happened stays where it was; it is history, and its day is
 * stored as a date that no zone change touches.
 *
 * Only the caller's own tasks move. On a shared task the block is the owner's
 * plan, and the other member sees it in their own zone.
 *
 * One transaction, with the profile row locked, so two changes in a row cannot
 * shift the same block twice from the same starting zone.
 *
 * Returns the blocks that have a Google Calendar event, so the caller can push
 * the new times: the event id never leaves the server, only the block's.
 */
export async function changeTimeZone(
  householdId: string,
  userId: string,
  zone: string,
): Promise<{ changed: boolean; from: string | null; resync: string[] }> {
  return dbPool.transaction(async (tx) => {
    const [me] = await tx
      .select({ timezone: profiles.timezone })
      .from(profiles)
      .where(and(eq(profiles.id, userId), eq(profiles.household_id, householdId)))
      .for("update");
    if (!me) return { changed: false, from: null, resync: [] };
    if (me.timezone === zone) return { changed: false, from: me.timezone, resync: [] };

    const from = me.timezone;
    await tx.update(profiles).set({ timezone: zone }).where(eq(profiles.id, userId));

    // Same wall clock, new zone: read the instant in the old zone, then say
    // that reading is in the new one.
    const moved = (col: AnyColumn) => sql`((${col} at time zone ${from}) at time zone ${zone})`;
    const mine = and(
      eq(tasks.household_id, householdId),
      eq(tasks.owner_id, userId),
      eq(tasks.status, "todo"),
    );

    await tx
      .update(tasks)
      .set({ block_start: moved(tasks.block_start), block_end: moved(tasks.block_end) })
      .where(and(mine, gt(tasks.block_end, sql`now()`)));

    // A reminder follows whoever set it; on rows older than `remind_by`, the owner.
    await tx
      .update(tasks)
      .set({ remind_at: moved(tasks.remind_at) })
      .where(
        and(
          eq(tasks.household_id, householdId),
          sql`coalesce(${tasks.remind_by}, ${tasks.owner_id}) = ${userId}`,
          eq(tasks.status, "todo"),
          isNull(tasks.reminder_sent_at),
          gt(tasks.remind_at, sql`now()`),
        ),
      );

    const blocks = await tx
      .update(taskBlocks)
      .set({ start_at: moved(taskBlocks.start_at), end_at: moved(taskBlocks.end_at) })
      .where(
        and(
          eq(taskBlocks.household_id, householdId),
          gt(taskBlocks.end_at, sql`now()`),
          sql`exists (select 1 from "tasks" t where t.id = "task_blocks"."task_id"
            and t.household_id = ${householdId} and t.owner_id = ${userId} and t.status = 'todo')`,
        ),
      )
      .returning({ id: taskBlocks.id, gcal_event_id: taskBlocks.gcal_event_id });

    return {
      changed: true,
      from,
      resync: blocks.filter((b) => b.gcal_event_id).map((b) => b.id),
    };
  });
}
