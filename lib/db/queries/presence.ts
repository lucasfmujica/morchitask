import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";

export async function partnerActiveTask(householdId: string, myId: string) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.household_id, householdId),
        eq(tasks.shared, true),
        isNotNull(tasks.active_since),
        ne(tasks.owner_id, myId),
      ),
    )
    .orderBy(desc(tasks.active_since))
    .limit(1);
  return row ?? null;
}
