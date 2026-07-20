"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/households";

export async function getHousehold() {
  const session = await auth();
  if (!session?.householdId) return null;
  return data.getHousehold(session.householdId);
}

export async function updateHouseholdName(name: string) {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  await data.updateHouseholdName(session.householdId, name);
}
