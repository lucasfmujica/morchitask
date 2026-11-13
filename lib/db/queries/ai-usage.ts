import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";

export type AiUsageKind = "breakdown" | "plan" | "capture";

/**
 * Counts one AI call against today's limit, or refuses it. True when the call
 * may go ahead.
 *
 * The count used to live in a `Map` in the server's memory, which on Vercel
 * means one count per warm instance, reset on every cold start: a limit in
 * name only, on the one feature where every call costs money.
 *
 * Stored as `ai_usage: { day, breakdown, plan, capture }` in
 * `profiles.notification_prefs`, the same jsonb column `checkout_started_at`
 * and `onboarded_at` already borrow, because a real column would need a
 * migration. A new day replaces the whole object, so it never grows.
 *
 * One statement, so it is atomic: the limit check is in the WHERE, and
 * Postgres re-checks it against the latest row when two calls race, so two
 * tabs cannot both take the last use. Scoped by household as well as user,
 * like every write. A row it does not match (wrong household, limit reached)
 * returns nothing, and that is the refusal.
 *
 * One caveat: `saveMyNotificationPrefs` still writes the whole object back, so
 * a settings save racing an AI call can roll today's count back by one. That
 * errs in the person's favour and only by the calls in flight.
 */
export async function consumeAiQuota(
  householdId: string,
  userId: string,
  kind: AiUsageKind,
  day: string,
  limit: number,
): Promise<boolean> {
  const usage = sql`${profiles.notification_prefs} -> 'ai_usage'`;
  const sameDay = sql`(${usage} ->> 'day') = ${day}`;
  const used = sql`(case when ${sameDay} then coalesce((${usage} ->> ${kind}::text)::int, 0) else 0 end)`;

  const rows = await db
    .update(profiles)
    .set({
      notification_prefs: sql`${profiles.notification_prefs} || jsonb_build_object('ai_usage',
        case when ${sameDay}
          then ${usage} || jsonb_build_object(${kind}::text, ${used} + 1)
          else jsonb_build_object('day', ${day}::text, ${kind}::text, 1)
        end)`,
    })
    .where(
      and(eq(profiles.id, userId), eq(profiles.household_id, householdId), sql`${used} < ${limit}`),
    )
    .returning({ id: profiles.id });

  return rows.length > 0;
}
