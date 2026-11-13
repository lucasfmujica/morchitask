"use server";

import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/channels";
import { orderForAppend } from "@/lib/ordering";

export async function getMyChannels() {
  const { householdId, userId } = await requireSession();
  return data.myChannels(householdId, userId);
}

export async function getHouseholdChannels() {
  const { householdId } = await requireSession();
  return data.householdChannels(householdId);
}

export async function createChannel(input: { name: string; color: string; icon?: string }) {
  const { householdId, userId } = await requireWriteAccess();
  const existing = await data.myChannels(householdId, userId);
  const sortOrder = orderForAppend(existing.map((c) => c.sort_order));
  return data.createChannel(householdId, userId, {
    name: String(input?.name ?? ""),
    color: String(input?.color ?? ""),
    icon: typeof input?.icon === "string" ? input.icon : undefined,
    sortOrder,
  });
}

export async function updateChannel(id: string, patch: { name?: string; color?: string }) {
  const { householdId, userId } = await requireWriteAccess();
  await data.updateChannel(householdId, userId, id, patch);
}

export async function reorderChannels(orderedIds: string[]) {
  const { householdId, userId } = await requireWriteAccess();
  await data.reorderChannels(householdId, userId, orderedIds);
}

export async function deleteChannel(id: string) {
  const { householdId, userId } = await requireWriteAccess();
  await data.deleteChannel(householdId, userId, id);
}
