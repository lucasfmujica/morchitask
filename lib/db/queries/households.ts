import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { households } from "@/lib/db/schema";

export async function getHousehold(householdId: string) {
  const [row] = await db.select().from(households).where(eq(households.id, householdId));
  return row ?? null;
}

export async function updateHouseholdName(householdId: string, name: string) {
  await db.update(households).set({ name }).where(eq(households.id, householdId));
}
