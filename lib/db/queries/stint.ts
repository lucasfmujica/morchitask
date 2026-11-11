import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { channels, stintLinks, taskBlocks, tasks } from "@/lib/db/schema";
import type { LocalLinked, StintStatus, SyncPlan } from "@/lib/stint";
import { localTitle } from "@/lib/stint";

/**
 * The Stint link's reads and writes. Every one is keyed by the household AND
 * the person from the session: a link mirrors one person's tasks, so nothing
 * here may touch a partner's rows, shared or not.
 */

export async function getStintLink(householdId: string, ownerId: string) {
  const [row] = await db
    .select()
    .from(stintLinks)
    .where(and(eq(stintLinks.household_id, householdId), eq(stintLinks.owner_id, ownerId)));
  return row ?? null;
}

export async function saveStintLink(householdId: string, ownerId: string, token: string) {
  await db
    .insert(stintLinks)
    .values({ household_id: householdId, owner_id: ownerId, token })
    .onConflictDoUpdate({ target: stintLinks.owner_id, set: { token, last_synced_at: null } });
}

/** Disconnecting keeps the tasks, as ordinary ones: they may hold your hours. */
export async function deleteStintLink(householdId: string, ownerId: string) {
  await db
    .update(tasks)
    .set({ stint_task_id: null, stint_status: null })
    .where(
      and(
        eq(tasks.household_id, householdId),
        eq(tasks.owner_id, ownerId),
        isNotNull(tasks.stint_task_id),
      ),
    );
  await db
    .delete(stintLinks)
    .where(and(eq(stintLinks.household_id, householdId), eq(stintLinks.owner_id, ownerId)));
}

export async function markStintSynced(householdId: string, ownerId: string) {
  await db
    .update(stintLinks)
    .set({ last_synced_at: new Date().toISOString() })
    .where(and(eq(stintLinks.household_id, householdId), eq(stintLinks.owner_id, ownerId)));
}

/**
 * The channel Stint tasks land in, named after the Stint workspace. Found by
 * name among your own channels, created once if missing, and remembered on
 * the link so renaming it later doesn't spawn a second one.
 */
export async function stintChannel(householdId: string, ownerId: string, name: string) {
  const link = await getStintLink(householdId, ownerId);
  if (link?.channel_id) {
    const [kept] = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.id, link.channel_id), eq(channels.household_id, householdId)));
    if (kept) return kept.id;
  }
  const [byName] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(
      and(
        eq(channels.household_id, householdId),
        eq(channels.owner_id, ownerId),
        eq(channels.name, name),
      ),
    );
  const id =
    byName?.id ??
    (
      await db
        .insert(channels)
        .values({ household_id: householdId, owner_id: ownerId, name, color: "#d93a1f" })
        .returning({ id: channels.id })
    )[0].id;
  await db
    .update(stintLinks)
    .set({ channel_id: id })
    .where(and(eq(stintLinks.household_id, householdId), eq(stintLinks.owner_id, ownerId)));
  return id;
}

/** Your linked tasks, with whether you already put work into them here. */
export async function linkedTasks(householdId: string, ownerId: string): Promise<LocalLinked[]> {
  const rows = await db
    .select({
      id: tasks.id,
      stint_task_id: tasks.stint_task_id,
      stint_status: tasks.stint_status,
      status: tasks.status,
      title: tasks.title,
      due_date: tasks.due_date,
      notes: tasks.notes,
      // Tracked time or a time block: removing it would lose something of yours.
      hasTime: sql<boolean>`coalesce(${tasks.actual_time_min}, 0) > 0 or ${tasks.block_start} is not null or exists (select 1 from ${taskBlocks} where ${taskBlocks.task_id} = ${tasks.id})`,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.household_id, householdId),
        eq(tasks.owner_id, ownerId),
        isNotNull(tasks.stint_task_id),
      ),
    );
  return rows.map((r) => ({ ...r, stint_task_id: r.stint_task_id!, hasTime: !!r.hasTime }));
}

export async function applyStintPlan(
  householdId: string,
  ownerId: string,
  channelId: string,
  plan: SyncPlan,
) {
  const mine = (ids: string[]) =>
    and(eq(tasks.household_id, householdId), eq(tasks.owner_id, ownerId), inArray(tasks.id, ids));

  if (plan.create.length) {
    await db
      .insert(tasks)
      .values(
        plan.create.map((r) => ({
          household_id: householdId,
          owner_id: ownerId,
          created_by: ownerId,
          channel_id: channelId,
          title: localTitle(r),
          notes: r.url,
          due_date: r.deadline,
          stint_task_id: r.id,
          stint_status: r.status,
        })),
      )
      // Two tabs syncing at once: the unique index keeps one copy.
      .onConflictDoNothing();
  }
  for (const u of plan.update)
    await db
      .update(tasks)
      .set(u.set)
      .where(mine([u.id]));
  if (plan.remove.length) await db.delete(tasks).where(mine(plan.remove));
  if (plan.unlink.length)
    await db
      .update(tasks)
      .set({ stint_task_id: null, stint_status: null })
      .where(mine(plan.unlink));
}

/** The Stint side of one of your tasks, for pushing a status there. */
export async function stintStateOf(householdId: string, ownerId: string, taskId: string) {
  const [row] = await db
    .select({ stintTaskId: tasks.stint_task_id, stintStatus: tasks.stint_status })
    .from(tasks)
    .where(
      and(eq(tasks.household_id, householdId), eq(tasks.owner_id, ownerId), eq(tasks.id, taskId)),
    );
  return row?.stintTaskId ? row : null;
}

export async function setStintStatus(
  householdId: string,
  ownerId: string,
  taskId: string,
  status: StintStatus,
) {
  await db
    .update(tasks)
    .set({ stint_status: status })
    .where(
      and(eq(tasks.household_id, householdId), eq(tasks.owner_id, ownerId), eq(tasks.id, taskId)),
    );
}
