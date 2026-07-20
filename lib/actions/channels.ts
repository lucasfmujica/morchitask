"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/channels";
import { orderForAppend } from "@/lib/ordering";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

export async function getMyChannels() {
  const { householdId, userId } = await requireSession();
  return data.myChannels(householdId, userId);
}

export async function getHouseholdChannels() {
  const { householdId } = await requireSession();
  return data.householdChannels(householdId);
}

export async function createChannel(input: { name: string; color: string; icon?: string }) {
  const { householdId, userId } = await requireSession();
  const existing = await data.myChannels(householdId, userId);
  const sortOrder = orderForAppend(existing.map((c) => c.sort_order));
  return data.createChannel(householdId, userId, { ...input, sortOrder });
}

export async function updateChannel(id: string, patch: { name?: string; color?: string }) {
  const { householdId } = await requireSession();
  await data.updateChannel(householdId, id, patch);
}

export async function reorderChannels(orderedIds: string[]) {
  const { householdId } = await requireSession();
  await data.reorderChannels(householdId, orderedIds);
}

export async function deleteChannel(id: string) {
  const { householdId } = await requireSession();
  await data.deleteChannel(householdId, id);
}
