import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db, dbPool } from "@/lib/db/client";
import { householdInvites, households, profiles, users } from "@/lib/db/schema";

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

export type InviteRefusal = "full" | "self" | "member";

/**
 * Creates an invite if the space has room for it, as one atomic step.
 *
 * Counting and inserting used to be two separate requests, so two invites sent
 * at once both saw one free seat and both went out — and both could be
 * claimed. Now the household row is locked first (the claim at sign-up takes
 * the same lock), so concurrent invites into one space queue up behind each
 * other and the second one sees the first.
 *
 * Also refuses the two invites that can only go wrong: your own address, and
 * the address of someone already inside.
 */
export async function createInviteWithinCap(
  householdId: string,
  invitedBy: string,
  email: string,
  token: string,
): Promise<
  | { ok: true; invite: Awaited<ReturnType<typeof createInvite>> }
  | { ok: false; reason: InviteRefusal }
> {
  const normalized = email.trim().toLowerCase();
  return dbPool.transaction(async (tx) => {
    await tx
      .select({ id: households.id })
      .from(households)
      .where(eq(households.id, householdId))
      .for("update");

    const members = await tx
      .select({ id: profiles.id, email: users.email })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.id))
      .where(eq(profiles.household_id, householdId));
    const match = members.find((m) => m.email.trim().toLowerCase() === normalized);
    if (match) return { ok: false, reason: match.id === invitedBy ? "self" : "member" };

    // Re-inviting replaces the live invite for the same address (see
    // `createInvite`), so that one does not count against the cap.
    const [pending] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(householdInvites)
      .where(
        and(
          eq(householdInvites.household_id, householdId),
          isNull(householdInvites.accepted_at),
          gt(householdInvites.expires_at, sql`now()`),
          ne(householdInvites.email, normalized),
        ),
      );
    // Live invites count as if already accepted: otherwise two invites both
    // claimed would overshoot the cap.
    if (members.length + (pending?.n ?? 0) >= MAX_HOUSEHOLD_MEMBERS) {
      return { ok: false, reason: "full" };
    }

    await tx
      .delete(householdInvites)
      .where(
        and(
          eq(householdInvites.household_id, householdId),
          eq(householdInvites.email, normalized),
          isNull(householdInvites.accepted_at),
        ),
      );
    const [invite] = await tx
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
    return { ok: true, invite };
  });
}

/** Scoped to the household so an id from someone else's space matches nothing. */
export async function revokeInvite(householdId: string, inviteId: string) {
  await db
    .delete(householdInvites)
    .where(and(eq(householdInvites.household_id, householdId), eq(householdInvites.id, inviteId)));
}
