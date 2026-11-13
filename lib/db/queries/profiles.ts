import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles, users } from "@/lib/db/schema";
import { pickProfilePatch } from "@/lib/patches";
import type { ProfilePatch } from "@/lib/queries/types";

export async function getProfile(userId: string) {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, userId));
  return row ?? null;
}

/**
 * The people in this household, as the other one may see them: name, colour,
 * photo. Not the whole row — that carried `notification_prefs` (with the AI
 * quota and billing markers), calendar settings and the capacity target, which
 * are each person's own business.
 */
export async function getHouseholdProfiles(householdId: string) {
  return db
    .select({
      id: profiles.id,
      household_id: profiles.household_id,
      display_name: profiles.display_name,
      color: profiles.color,
      avatar_url: profiles.avatar_url,
    })
    .from(profiles)
    .where(eq(profiles.household_id, householdId));
}

export type HouseholdProfile = Awaited<ReturnType<typeof getHouseholdProfiles>>[number];

/** `patch` is rebuilt from a whitelist (`pickProfilePatch`): it used to be
 *  spread straight into `set()`, and `household_id` in it moved the caller
 *  into any household they named. */
export async function updateProfile(userId: string, patch: ProfilePatch) {
  const clean = pickProfilePatch(patch);
  if (Object.keys(clean).length === 0) return getProfile(userId);
  const [row] = await db.update(profiles).set(clean).where(eq(profiles.id, userId)).returning();
  return row ?? null;
}

/** Points the profile at an avatar the caller has already validated. */
export async function setAvatarUrl(userId: string, avatarUrl: string | null) {
  await db.update(profiles).set({ avatar_url: avatarUrl }).where(eq(profiles.id, userId));
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
