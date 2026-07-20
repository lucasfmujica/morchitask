"use server";

import { auth } from "@/lib/auth";
import { partnerActiveTask } from "@/lib/db/queries/presence";

export async function getPartnerActiveTask() {
  const session = await auth();
  if (!session?.householdId) return null;
  return partnerActiveTask(session.householdId, session.user.id);
}
