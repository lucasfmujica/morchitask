import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, profiles } from "@/lib/db/schema";
import { decideGoogleGrant, type GoogleAccount, type GrantDecision } from "@/lib/google-grant";

/**
 * Persists a Google sign-in's tokens, but only when they carry Calendar access
 * (see `decideGoogleGrant`). The Adapter itself only writes tokens the first
 * time an account links, so a later Calendar connect would otherwise be lost.
 *
 * Keyed by userId on purpose: the `accounts` row and the connected flag are
 * per person, not per household. A household-wide write here would connect or
 * clobber the other member's calendar.
 */
export async function applyGoogleGrant(
  userId: string,
  account: GoogleAccount | null | undefined,
): Promise<GrantDecision> {
  const decision = decideGoogleGrant(account);
  if (decision.action !== "store") return decision;
  await db
    .update(accounts)
    .set(decision.tokens)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")));
  await db.update(profiles).set({ google_calendar_connected: true }).where(eq(profiles.id, userId));
  return decision;
}

export async function getGoogleRefreshToken(userId: string) {
  const [row] = await db
    .select({ refresh_token: accounts.refresh_token })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")));
  return row?.refresh_token ?? null;
}

/**
 * Clears the stored Calendar tokens and the connected flag. Only nulls the
 * token columns on the `accounts` row — the row itself (provider +
 * providerAccountId) must stay, since Auth.js's adapter uses it to recognize
 * the user on their next Google sign-in. Deleting it would risk a duplicate
 * account / broken login, not just a disconnected calendar.
 */
export async function disconnectGoogleCalendar(userId: string) {
  await db
    .update(accounts)
    .set({ refresh_token: null, access_token: null, expires_at: null, scope: null })
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")));
  await db
    .update(profiles)
    .set({ google_calendar_connected: false })
    .where(eq(profiles.id, userId));
}
