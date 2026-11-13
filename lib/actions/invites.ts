"use server";

import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/actions/session";
import { resolveAccess } from "@/lib/billing";
import { isBillingEnabled } from "@/lib/billing-config";
import * as data from "@/lib/db/queries/invites";
import {
  inviteHouseholdByToken,
  invitePreview,
  joinHousehold,
  joinRefusal,
  ownTaskCount,
  type JoinRefusal,
} from "@/lib/db/queries/membership";
import { billingFacts, billingManager, getSubscription } from "@/lib/db/queries/subscriptions";
import { isValidEmail } from "@/lib/email";
import { getTranslations } from "next-intl/server";

export async function listInvites() {
  const { householdId } = await requireSession();
  const [invites, members] = await Promise.all([
    data.pendingInvites(householdId),
    data.memberCount(householdId),
  ]);
  return { invites, members, max: data.MAX_HOUSEHOLD_MEMBERS };
}

/**
 * Invites someone to this space.
 *
 * The address is the credential: whoever signs in with it gets in, so the two
 * checks below are what stand between "share with my partner" and "hand out a
 * seat in my data". The token is only for the link in the mail — the claim at
 * sign-up keys on the address.
 */
export async function inviteToHousehold(email: string) {
  const { householdId, userId } = await requireSession();
  // The card renders `error.message` straight onto the screen, so these
  // are copy, not diagnostics — a server action can't use `useTranslations`,
  // but `getTranslations` reads the same cookie the page was rendered with.
  const t = await getTranslations("errors");

  const normalized = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!isValidEmail(normalized)) throw new Error(t("invalidEmail"));

  // Count and insert happen in one transaction that locks the household, so
  // two invites sent at once cannot both take the last seat.
  const result = await data.createInviteWithinCap(
    householdId,
    userId,
    normalized,
    randomBytes(32).toString("base64url"),
  );
  if (!result.ok) {
    throw new Error(
      t(
        result.reason === "self"
          ? "inviteSelf"
          : result.reason === "member"
            ? "alreadyMember"
            : "spaceFull",
      ),
    );
  }
  return result.invite;
}

export async function revokeInvite(inviteId: string) {
  const { householdId } = await requireSession();
  await data.revokeInvite(householdId, inviteId);
}

export type JoinResult = { ok: true } | { ok: false; reason: JoinRefusal };

/**
 * Joins the space an invite link points at, with an account that already has
 * a space of its own. Requires a session but not a plan: someone whose trial
 * ran out joining a space that pays is exactly who this is for, and joining
 * spends nothing.
 */
export async function acceptInvite(token: string): Promise<JoinResult> {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  const res = await joinHousehold(String(token), session.user.id, session.user.email);
  return res.ok ? { ok: true } : res;
}

/**
 * Everything the accept page shows, from the side of the person opening it.
 * `null` when the link is unusable; `"member"` when they are already in that
 * space (a brand-new account is placed there by the invite at sign-up, then
 * lands back on the link).
 */
export async function getInviteView(token: string) {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  const householdId = session.householdId;
  const userId = session.user.id;

  const preview = await invitePreview(token);
  if (!preview) {
    return (await inviteHouseholdByToken(token)) === householdId ? ("member" as const) : null;
  }
  if (preview.householdId === householdId) return "member" as const;

  const billing = isBillingEnabled();
  const [taskCount, mine, myMembers, theirMembers, theirFacts, theirManager] = await Promise.all([
    ownTaskCount(householdId, userId),
    billing ? getSubscription(householdId) : null,
    data.memberCount(householdId),
    data.memberCount(preview.householdId),
    billing ? billingFacts(preview.householdId) : null,
    billing ? billingManager(preview.householdId) : null,
  ]);

  const refusal = joinRefusal({
    inviteEmail: preview.email,
    userEmail: session.user.email,
    fromHousehold: householdId,
    toHousehold: preview.householdId,
    fromMembers: myMembers,
    toMembers: theirMembers,
    ownSubscription: mine,
  });
  const theirAccess = theirFacts ? resolveAccess(theirFacts) : null;

  return {
    token,
    refusal,
    email: preview.email,
    me: { email: session.user.email ?? "", taskCount, access: billing ? session.access : null },
    expiresAt: preview.expiresAt,
    space: preview.spaceName,
    inviter: {
      id: preview.inviterId,
      household_id: preview.householdId,
      display_name: preview.inviterName,
      color: preview.inviterColor,
      avatar_url: preview.inviterAvatar,
    },
    // Whose plan covers the space: the payer when known, the inviter otherwise.
    payerName: theirManager?.display_name ?? preview.inviterName,
    theirs: theirAccess
      ? { source: theirAccess.source, allowed: theirAccess.allowed, until: theirAccess.until }
      : null,
    mySubscription: mine
      ? {
          interval: mine.recurring_interval,
          periodEnd: mine.current_period_end,
        }
      : null,
  };
}
