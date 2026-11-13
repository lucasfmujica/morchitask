"use server";

import { randomBytes } from "node:crypto";
import { requireSession } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/invites";
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
