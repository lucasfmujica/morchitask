"use server";

import { auth } from "@/lib/auth";
import { partnerActiveTasks } from "@/lib/db/queries/presence";

export async function getPartnerActiveTasks() {
  const session = await auth();
  if (!session?.householdId) return [];
  return partnerActiveTasks(session.householdId, session.user.id);
}
