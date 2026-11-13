import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { channels } from "@/lib/db/schema";
import { pickChannelPatch } from "@/lib/patches";

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

/** Categories are per person (see household-provisioning), so only their
 *  owner renames, reorders or deletes them — household-wide scoping let one
 *  person rename the other's. */
function scoped(householdId: string, ownerId: string, id: string) {
  return and(
    eq(channels.id, id),
    eq(channels.household_id, householdId),
    eq(channels.owner_id, ownerId),
  );
}

export async function updateChannel(
  householdId: string,
  ownerId: string,
  id: string,
  patch: { name?: string; color?: string },
) {
  const clean = pickChannelPatch(patch);
  if (Object.keys(clean).length === 0) return;
  await db
    .update(channels)
    .set(clean)
    .where(scoped(householdId, ownerId, id));
}

export async function reorderChannels(householdId: string, ownerId: string, orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, i) =>
      db
        .update(channels)
        .set({ sort_order: (i + 1) * 1000 })
        .where(scoped(householdId, ownerId, id)),
    ),
  );
}

export async function deleteChannel(householdId: string, ownerId: string, id: string) {
  await db.delete(channels).where(scoped(householdId, ownerId, id));
}
