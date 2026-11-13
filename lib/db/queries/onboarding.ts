import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { households, profiles, tasks } from "@/lib/db/schema";
import { ONBOARDED_MARKER, type OnboardingFacts } from "@/lib/onboarding";

/**
 * Everything `isOnboarded` needs, in one read.
 *
 * One query because it runs on the way into Hoy, every time: the marker, the
 * household's override, and whether the household holds any task at all. The
 * profile is matched on both ids, so a user id paired with someone else's
 * household finds nothing, and the task check is scoped to that household.
 *
 * Null when there is no such profile in that household.
 */
export async function onboardingFacts(
  householdId: string,
  userId: string,
): Promise<OnboardingFacts | null> {
  const [row] = await db
    .select({
      onboardedAt: sql<string | null>`${profiles.notification_prefs} ->> ${ONBOARDED_MARKER}`,
      planOverride: households.plan_override,
      householdHasTasks: sql<boolean>`exists (select 1 from ${tasks} where ${tasks.household_id} = ${households.id})`,
    })
    .from(profiles)
    .innerJoin(households, eq(households.id, profiles.household_id))
    .where(and(eq(profiles.id, userId), eq(profiles.household_id, householdId)));

  if (!row) return null;
  return {
    onboardedAt: row.onboardedAt ?? null,
    planOverride: row.planOverride ?? null,
    householdHasTasks: !!row.householdHasTasks,
  };
}

/**
 * Remembers that this person is past onboarding, the first time.
 *
 * Same shape as `recordCheckoutStarted`: merged into `notification_prefs` in
 * SQL rather than read-modify-written, so it cannot race a preferences save,
 * and set once, so finishing after skipping (or the reverse) keeps the first
 * date.
 */
export async function markOnboarded(householdId: string, userId: string) {
  await db
    .update(profiles)
    .set({
      notification_prefs: sql`${profiles.notification_prefs} || jsonb_build_object(${ONBOARDED_MARKER}::text, now())`,
    })
    .where(
      and(
        eq(profiles.id, userId),
        eq(profiles.household_id, householdId),
        sql`${profiles.notification_prefs} ->> ${ONBOARDED_MARKER} is null`,
      ),
    );
}
