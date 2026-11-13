/**
 * Who runs a shared space, decided from data the app already has.
 *
 * There is no "owner" column and no migration to add one, so the answer is
 * read off two facts:
 *
 * - who pays: the webhook marks the member whose checkout started the
 *   subscription (`billing_manager_for` in their prefs). That person
 *   manages the plan, and because the plan is the space's, they run it.
 * - who made it: the member nobody invited. Someone who joined has an
 *   accepted invite addressed to their email; the other one created the
 *   space. When neither has one (the spaces that predate invites), the older
 *   profile is the creator.
 *
 * The admin is whoever pays, or, before anyone has, whoever made the space.
 * Only the admin may remove the other person, and the admin is the one who
 * cannot leave while someone else is still inside: a plan whose payer walked
 * out would be paying for a space they are no longer in.
 *
 * Pure, so each way of arriving at a pair is a test.
 */

export type SpaceMemberFacts = {
  id: string;
  displayName: string;
  color: string;
  avatarUrl: string | null;
  locale: string;
  /** Postgres timestamp text. */
  profileCreatedAt: string;
  /** When their invite into this space was accepted, if they joined on one. */
  joinedAt: string | null;
  /** True for the member the webhook recorded as paying for this space. */
  managesPlan: boolean;
};

export type SpaceRoles = {
  creatorId: string | null;
  managerId: string | null;
  adminId: string | null;
};

/** Postgres hands timestamps back as "2026-10-02 10:00:00+00", which `Date`
 *  cannot parse ("+00" is not an offset to it): every comparison came out
 *  NaN, and the sort silently kept whatever order the rows arrived in. */
const ms = (v: string) => new Date(v.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")).getTime();

export function spaceRoles(members: readonly SpaceMemberFacts[]): SpaceRoles {
  if (members.length === 0) return { creatorId: null, managerId: null, adminId: null };
  const byAge = [...members].sort((a, b) => ms(a.profileCreatedAt) - ms(b.profileCreatedAt));
  const creator = byAge.find((m) => !m.joinedAt) ?? byAge[0];
  const manager = members.find((m) => m.managesPlan) ?? null;
  return {
    creatorId: creator.id,
    managerId: manager?.id ?? null,
    adminId: manager?.id ?? creator.id,
  };
}
