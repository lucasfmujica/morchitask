"use server";

import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/invites";
import { isValidEmail } from "@/lib/email";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

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

  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) throw new Error("Esa dirección de mail no parece válida.");

  // Counting live invites as if they were already members: otherwise sending
  // two invites and having both accepted would quietly overshoot the cap.
  const [members, pending] = await Promise.all([
    data.memberCount(householdId),
    data.pendingInvites(householdId),
  ]);
  const alreadyInvited = pending.some((i) => i.email === normalized);
  if (!alreadyInvited && members + pending.length >= data.MAX_HOUSEHOLD_MEMBERS) {
    throw new Error("Tu espacio ya está completo. Cancelá una invitación para enviar otra.");
  }

  return data.createInvite(householdId, userId, normalized, randomBytes(32).toString("base64url"));
}

export async function revokeInvite(inviteId: string) {
  const { householdId } = await requireSession();
  await data.revokeInvite(householdId, inviteId);
}
