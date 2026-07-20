import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { channels } from "@/lib/db/schema";

export async function myChannels(householdId: string, ownerId: string) {
  return db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.household_id, householdId),
        eq(channels.owner_id, ownerId),
        isNull(channels.archived_at),
      ),
    )
    .orderBy(asc(channels.sort_order));
}

export async function householdChannels(householdId: string) {
  return db
    .select()
    .from(channels)
    .where(and(eq(channels.household_id, householdId), isNull(channels.archived_at)));
}

export async function createChannel(
  householdId: string,
  ownerId: string,
  input: { name: string; color: string; icon?: string; sortOrder: number },
) {
  const [row] = await db
    .insert(channels)
    .values({
      household_id: householdId,
      owner_id: ownerId,
      name: input.name,
      color: input.color,
      icon: input.icon,
      sort_order: input.sortOrder,
    })
    .returning();
  return row;
}

function scoped(householdId: string, id: string) {
  return and(eq(channels.id, id), eq(channels.household_id, householdId));
}

export async function updateChannel(
  householdId: string,
  id: string,
  patch: { name?: string; color?: string },
) {
  await db.update(channels).set(patch).where(scoped(householdId, id));
}

export async function reorderChannels(householdId: string, orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, i) =>
      db
        .update(channels)
        .set({ sort_order: (i + 1) * 1000 })
        .where(scoped(householdId, id)),
    ),
  );
}

export async function deleteChannel(householdId: string, id: string) {
  await db.delete(channels).where(scoped(householdId, id));
}
