import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { householdInvites, profiles } from "@/lib/db/schema";

/** A week is long enough to be forwarded and read, short enough that a stale
 *  invite in someone's inbox stops being a way in. */
export const INVITE_TTL_DAYS = 7;

/** How many people may share one space. Two is what the product is for; the
 *  cap exists so an invite link can't quietly turn a household into a team. */
export const MAX_HOUSEHOLD_MEMBERS = 2;

export async function memberCount(householdId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(profiles)
    .where(eq(profiles.household_id, householdId));
  return row?.n ?? 0;
}

/** Invites that are still live: neither claimed nor expired. */
export async function pendingInvites(householdId: string) {
  return db
    .select({
      id: householdInvites.id,
      email: householdInvites.email,
      // The invite link is sent by hand for now, so the sender needs the token.
      token: householdInvites.token,
      expires_at: householdInvites.expires_at,
      created_at: householdInvites.created_at,
    })
    .from(householdInvites)
    .where(
      and(
        eq(householdInvites.household_id, householdId),
        isNull(householdInvites.accepted_at),
        gt(householdInvites.expires_at, sql`now()`),
      ),
    )
    .orderBy(desc(householdInvites.created_at));
}

/**
 * Creates an invite, replacing any live one for the same address.
 *
 * Re-inviting is the normal way to deal with "they never got the mail", so it
 * has to be idempotent — otherwise each attempt leaves another live invite
 * behind, and revoking the one you can see wouldn't actually close the door.
 */
export async function createInvite(
  householdId: string,
  invitedBy: string,
  email: string,
  token: string,
) {
  const normalized = email.trim().toLowerCase();

  await db
    .delete(householdInvites)
    .where(
      and(
        eq(householdInvites.household_id, householdId),
        eq(householdInvites.email, normalized),
        isNull(householdInvites.accepted_at),
      ),
    );

  const [row] = await db
    .insert(householdInvites)
    .values({
      household_id: householdId,
      invited_by: invitedBy,
      email: normalized,
      token,
      expires_at: sql`now() + interval '${sql.raw(String(INVITE_TTL_DAYS))} days'`,
    })
    .returning({
      id: householdInvites.id,
      email: householdInvites.email,
      token: householdInvites.token,
      expires_at: householdInvites.expires_at,
    });

  return row;
}

/** Scoped to the household so an id from someone else's space matches nothing. */
export async function revokeInvite(householdId: string, inviteId: string) {
  await db
    .delete(householdInvites)
    .where(and(eq(householdInvites.household_id, householdId), eq(householdInvites.id, inviteId)));
}
