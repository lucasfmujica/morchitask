import { and, desc, eq, gte, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";

/** A tab closed with timers running leaves `active_since` set forever, and now
 *  that several can run at once that leak multiplies. Anything older than this
 *  reads as stale rather than live presence. */
const STALE_AFTER_MS = 8 * 60 * 60 * 1000;

/** The partner's currently-active shared tasks, newest first. They can have
 *  several stopwatches going, so this returns a short list, not a single row. */
export async function partnerActiveTasks(householdId: string, myId: string, limit = 3) {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.household_id, householdId),
        eq(tasks.shared, true),
        isNotNull(tasks.active_since),
        gte(tasks.active_since, cutoff),
        ne(tasks.owner_id, myId),
      ),
    )
    .orderBy(desc(tasks.active_since))
    .limit(limit);
}
