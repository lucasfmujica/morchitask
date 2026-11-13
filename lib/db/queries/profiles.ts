import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles, users } from "@/lib/db/schema";
import type { ProfilePatch } from "@/lib/queries/types";

export async function getProfile(userId: string) {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, userId));
  return row ?? null;
}

export async function getHouseholdProfiles(householdId: string) {
  return db.select().from(profiles).where(eq(profiles.household_id, householdId));
}

export async function updateProfile(userId: string, patch: ProfilePatch) {
  const [row] = await db.update(profiles).set(patch).where(eq(profiles.id, userId)).returning();
  return row ?? null;
}

/** Merges user-editable notification prefs into the jsonb column in one
 *  statement, so server-owned keys written concurrently survive. */
export async function mergeNotificationPrefs(userId: string, patch: Record<string, unknown>) {
  const [row] = await db
    .update(profiles)
    .set({
      notification_prefs: sql`coalesce(${profiles.notification_prefs}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(profiles.id, userId))
    .returning({ prefs: profiles.notification_prefs });
  return (row?.prefs as Record<string, unknown> | undefined) ?? null;
}

/** The other household member's email, for Google Calendar invites on shared tasks. */
export async function partnerEmail(householdId: string, userId: string) {
  const [row] = await db
    .select({ email: users.email })
    .from(profiles)
    .innerJoin(users, eq(profiles.id, users.id))
    .where(and(eq(profiles.household_id, householdId), ne(profiles.id, userId)));
  return row?.email ?? null;
}
