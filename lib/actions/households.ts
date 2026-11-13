"use server";

import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/actions/session";
import { resolveAccess } from "@/lib/billing";
import { isBillingEnabled } from "@/lib/billing-config";
import * as data from "@/lib/db/queries/households";
import * as membership from "@/lib/db/queries/membership";
import { billingFacts } from "@/lib/db/queries/subscriptions";

export async function getHousehold() {
  const session = await auth();
  if (!session?.householdId) return null;
  return data.getHousehold(session.householdId);
}

export async function updateHouseholdName(name: string) {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  await data.updateHouseholdName(session.householdId, name);
}

/**
 * The shared space as the settings card draws it: who is in, who runs it,
 * and what the caller may do about the other person.
 */
export async function getSpace() {
  const { householdId, userId } = await requireSession();
  const [space, household] = await Promise.all([
    membership.spaceMembers(householdId),
    data.getHousehold(householdId),
  ]);
  const { roles } = space;
  const other = space.members.find((m) => m.id !== userId) ?? null;
  return {
    name: household?.name ?? null,
    createdAt: space.createdAt,
    meId: userId,
    members: space.members.map((m) => ({
      id: m.id,
      display_name: m.displayName,
      color: m.color,
      avatar_url: m.avatarUrl,
      household_id: householdId,
      joinedAt: m.joinedAt ?? (m.id === roles.creatorId ? null : m.profileCreatedAt),
      isCreator: m.id === roles.creatorId,
      managesPlan: m.id === roles.managerId,
    })),
    managerId: roles.managerId,
    // Only the person who runs the space can take the other one out; only the
    // other one can walk out. Never both, never the same person.
    canRemove: !!other && roles.adminId === userId,
    canLeave: !!other && roles.adminId !== userId,
  };
}

/** What leaving (or removing `memberId`) would move, for the sheet. Only
 *  answered for the two people who could act on it. */
export async function getSeparationPreview(memberId: string) {
  const { householdId, userId } = await requireSession();
  const space = await getSpace();
  const allowed =
    (memberId === userId && space.canLeave) || (memberId !== userId && space.canRemove);
  if (!allowed || !space.members.some((m) => m.id === memberId)) throw new Error("forbidden");
  const [counts, facts] = await Promise.all([
    membership.moveCounts(householdId, memberId),
    billingFacts(householdId),
  ]);
  return {
    counts,
    billingEnabled: isBillingEnabled(),
    access: facts ? resolveAccess(facts) : null,
  };
}

export type SeparateResult = { ok: true } | { ok: false; reason: membership.SeparateRefusal };

/** Leave the shared space for one of your own, with your private things. */
export async function leaveSpace(): Promise<SeparateResult> {
  const { householdId, userId } = await requireSession();
  const res = await membership.separateMember(householdId, userId, userId);
  return res.ok ? { ok: true } : res;
}

/** Take the other member out of this space, into one of their own. */
export async function removeMember(memberId: string): Promise<SeparateResult> {
  const { householdId, userId } = await requireSession();
  if (memberId === userId) return { ok: false, reason: "not_admin" };
  const res = await membership.separateMember(householdId, userId, String(memberId));
  return res.ok ? { ok: true } : res;
}
