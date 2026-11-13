import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, dbPool } from "@/lib/db/client";
import {
  channels,
  dailyNotes,
  householdInvites,
  households,
  objectives,
  profiles,
  recurringTemplates,
  stintLinks,
  subscriptions,
  subtasks,
  taskAttachments,
  taskBlocks,
  taskComments,
  taskReactions,
  taskTimeEntries,
  tasks,
  users,
  weeklyNotes,
} from "@/lib/db/schema";
import { isLiveSubscription } from "@/lib/billing";
import { MAX_HOUSEHOLD_MEMBERS } from "@/lib/db/queries/invites";
import { BILLING_MANAGER_MARKER } from "@/lib/db/queries/subscriptions";
import { defaultHouseholdName } from "@/lib/household-provisioning";
import { toLocale } from "@/lib/locale";
import { spaceRoles, type SpaceMemberFacts } from "@/lib/space-roles";

/**
 * Moving a person between spaces: leaving one, being removed from one, or
 * joining someone else's with an account that already has a day in it.
 *
 * All three are the same operation with different edges, and the edge is the
 * whole risk: this is code that rewrites `household_id`, the one column every
 * isolation guarantee in this app hangs on. A row left behind in the old space
 * is a private task the other person can now open; a row dragged along is the
 * other person's task leaving with someone who never owned it. So the rule is
 * written once, here, and run inside one transaction per move:
 *
 * - What is private belongs to whoever created it, and goes where they go.
 *   Their categories, goals, routines and notes are theirs too.
 * - What is shared belongs to the space. A shared task the mover owned stays
 *   and passes to the person who stays, the same hand-over `deleteAccount` does.
 * - The mover's minutes, comments and reactions on what stays, stay with it:
 *   they are part of the other person's history of that task.
 */

type Tx = Parameters<Parameters<typeof dbPool.transaction>[0]>[0];

/** Who is in a space, with what `spaceRoles` needs to decide who runs it. */
async function membersOf(tx: Tx, householdId: string): Promise<SpaceMemberFacts[]> {
  const rows = await tx
    .select({
      id: profiles.id,
      displayName: profiles.display_name,
      color: profiles.color,
      avatarUrl: profiles.avatar_url,
      locale: profiles.locale,
      profileCreatedAt: profiles.created_at,
      // Joined on an invite: the accepted invite addressed to this person's
      // email is the record of it. The person nobody invited made the space.
      joinedAt: sql<
        string | null
      >`(select max(i.accepted_at)::text from "household_invites" i where i.household_id = ${householdId} and i.accepted_at is not null and i.email = lower(${users.email}))`,
      managesPlan: sql<boolean>`coalesce(${profiles.notification_prefs} ->> ${BILLING_MANAGER_MARKER}::text = ${householdId}::text, false)`,
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.id))
    .where(eq(profiles.household_id, householdId))
    .orderBy(asc(profiles.created_at));
  return rows.map((r) => ({ ...r, managesPlan: !!r.managesPlan }));
}

/** The members of a space and their roles, for the settings card. */
export async function spaceMembers(householdId: string) {
  return dbPool.transaction(async (tx) => {
    const members = await membersOf(tx, householdId);
    const [household] = await tx
      .select({ createdAt: households.created_at })
      .from(households)
      .where(eq(households.id, householdId));
    return { members, roles: spaceRoles(members), createdAt: household?.createdAt ?? null };
  });
}

/**
 * What moving `userId` out of this space would take and leave, counted for
 * the confirmation sheet. Counted with the same predicates the move uses, so
 * the numbers on the sheet are the rows that will actually move.
 */
export async function moveCounts(householdId: string, userId: string) {
  const [row] = await db
    .select({
      privateTasks: sql<number>`count(*) filter (where not ${tasks.shared})::int`,
      sharedTasks: sql<number>`count(*) filter (where ${tasks.shared})::int`,
      sharedDated: sql<number>`count(*) filter (where ${tasks.shared} and ${tasks.status} = 'todo' and ${tasks.planned_date} is not null)::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.household_id, householdId), eq(tasks.owner_id, userId)));
  // Comments on whatever stays in the space: every shared task, whoever owns it.
  const [comments] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(taskComments)
    .where(
      and(
        eq(taskComments.household_id, householdId),
        eq(taskComments.author_id, userId),
        sql`exists (select 1 from "tasks" t where t.id = ${taskComments.task_id} and t.household_id = ${householdId} and t.shared)`,
      ),
    );
  return {
    privateTasks: row?.privateTasks ?? 0,
    sharedTasks: row?.sharedTasks ?? 0,
    sharedDated: row?.sharedDated ?? 0,
    comments: comments?.n ?? 0,
  };
}

/** How many tasks this person has in their space, whatever their kind. What
 *  joining another space would bring along. */
export async function ownTaskCount(householdId: string, userId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.household_id, householdId), eq(tasks.owner_id, userId)));
  return row?.n ?? 0;
}

/** Ids of rows owned by `userId` in `table`, as a subquery. Raw names: drizzle
 *  renders columns unqualified inside UPDATE, and an unqualified `owner_id`
 *  in here would bind to the outer table. */
const ownedBy = (table: "channels" | "objectives" | "recurring_templates", userId: string) =>
  sql`(select x.id from ${sql.raw(`"${table}"`)} x where x.owner_id = ${userId})`;

/**
 * Moves one person's own things from `from` to `to`.
 *
 * `privatize` is the join case: the person is the only one in `from`, so
 * everything of theirs goes, and what was shared in their old space arrives
 * private, because the new space's other member never agreed to see it. With
 * `heirId` (leaving, being removed), only private tasks go and the shared ones
 * pass to the heir.
 */
async function moveMember(
  tx: Tx,
  opts: { from: string; to: string; userId: string; heirId: string | null; privatize: boolean },
) {
  const { from, to, userId, heirId, privatize } = opts;

  const moving = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.household_id, from),
        eq(tasks.owner_id, userId),
        privatize ? undefined : eq(tasks.shared, false),
      ),
    );
  const movingIds = moving.map((t) => t.id);

  if (movingIds.length) {
    // Anything on a moving task that points at someone or something staying
    // behind is cut: a category of the other person's, their name as creator.
    // A reference into another space is a door between the two.
    await tx
      .update(tasks)
      .set({
        household_id: to,
        ...(privatize ? { shared: false } : {}),
        created_by: sql`case when ${tasks.created_by} = ${userId} then ${tasks.created_by} else null end`,
        channel_id: sql`case when ${tasks.channel_id} in ${ownedBy("channels", userId)} then ${tasks.channel_id} else null end`,
        objective_id: sql`case when ${tasks.objective_id} in ${ownedBy("objectives", userId)} then ${tasks.objective_id} else null end`,
        template_id: sql`case when ${tasks.template_id} in ${ownedBy("recurring_templates", userId)} then ${tasks.template_id} else null end`,
      })
      .where(inArray(tasks.id, movingIds));

    // What hangs off a task is as private as the task, so it travels with it:
    // including anything the other member once left on it while it was shared.
    for (const child of [
      taskBlocks,
      taskTimeEntries,
      taskComments,
      taskReactions,
      taskAttachments,
    ] as const) {
      await tx.update(child).set({ household_id: to }).where(inArray(child.task_id, movingIds));
    }
    await tx
      .update(subtasks)
      .set({
        household_id: to,
        assignee_id: sql`case when ${subtasks.assignee_id} = ${userId} then ${subtasks.assignee_id} else null end`,
      })
      .where(inArray(subtasks.task_id, movingIds));
  }

  if (heirId) {
    const handed = await tx
      .select({ id: tasks.id, status: tasks.status, planned: tasks.planned_date })
      .from(tasks)
      .where(and(eq(tasks.household_id, from), eq(tasks.owner_id, userId), eq(tasks.shared, true)));
    const handedIds = handed.map((t) => t.id);
    // Still open and on one of the leaver's days: those days are not the
    // heir's, so the task goes to their backlog, undated, rather than onto
    // a day they never planned.
    const undated = handed.filter((t) => t.status === "todo" && t.planned).map((t) => t.id);
    if (handedIds.length) {
      await tx
        .update(tasks)
        .set({
          owner_id: heirId,
          // The leaver's dated minutes stay on the task as entries; the undated
          // remainder was theirs as owner and would otherwise read as the heir's.
          actual_time_min: sql`(select nullif(coalesce(sum(e.minutes), 0), 0) from "task_time_entries" e where e.task_id = "tasks"."id")`,
          active_since: null,
          remind_at: null,
          // The calendar event lives in the leaver's Google Calendar, which the
          // heir cannot write to.
          gcal_event_id: null,
          gcal_synced_at: null,
        })
        .where(inArray(tasks.id, handedIds));
    }
    if (undated.length) {
      // Deleting the blocks clears block_start/block_end through the trigger.
      await tx.delete(taskBlocks).where(inArray(taskBlocks.task_id, undated));
      await tx
        .update(tasks)
        .set({ planned_date: null, rollover_origin_date: null })
        .where(inArray(tasks.id, undated));
    }
  }

  // Whatever stays may not keep pointing at the mover's categories, goals and
  // routines, which are about to leave. Same for a subtask assigned to them.
  await tx
    .update(tasks)
    .set({ channel_id: null })
    .where(
      and(eq(tasks.household_id, from), sql`${tasks.channel_id} in ${ownedBy("channels", userId)}`),
    );
  await tx
    .update(tasks)
    .set({ objective_id: null })
    .where(
      and(
        eq(tasks.household_id, from),
        sql`${tasks.objective_id} in ${ownedBy("objectives", userId)}`,
      ),
    );
  await tx
    .update(tasks)
    .set({ template_id: null, template_date: null })
    .where(
      and(
        eq(tasks.household_id, from),
        sql`${tasks.template_id} in ${ownedBy("recurring_templates", userId)}`,
      ),
    );
  await tx
    .update(recurringTemplates)
    .set({ channel_id: null })
    .where(
      and(
        eq(recurringTemplates.household_id, from),
        ne(recurringTemplates.owner_id, userId),
        sql`${recurringTemplates.channel_id} in ${ownedBy("channels", userId)}`,
      ),
    );
  await tx
    .update(subtasks)
    .set({ assignee_id: null })
    .where(and(eq(subtasks.household_id, from), eq(subtasks.assignee_id, userId)));

  // The person's own things. A routine of theirs that files into someone
  // else's category loses the category, not the routine.
  await tx
    .update(recurringTemplates)
    .set({
      household_id: to,
      channel_id: sql`case when ${recurringTemplates.channel_id} in ${ownedBy("channels", userId)} then ${recurringTemplates.channel_id} else null end`,
    })
    .where(and(eq(recurringTemplates.household_id, from), eq(recurringTemplates.owner_id, userId)));
  for (const table of [channels, objectives, dailyNotes, weeklyNotes, stintLinks] as const) {
    await tx
      .update(table)
      .set({ household_id: to })
      .where(and(eq(table.household_id, from), eq(table.owner_id, userId)));
  }

  // An invite they sent is an open door into the space they are leaving.
  await tx
    .delete(householdInvites)
    .where(
      and(
        eq(householdInvites.household_id, from),
        eq(householdInvites.invited_by, userId),
        isNull(householdInvites.accepted_at),
      ),
    );

  // Last, the person. Their "manages this plan" marker names the old space and
  // means nothing anywhere else.
  await tx
    .update(profiles)
    .set({
      household_id: to,
      notification_prefs: sql`${profiles.notification_prefs} - ${BILLING_MANAGER_MARKER}::text`,
    })
    .where(and(eq(profiles.id, userId), eq(profiles.household_id, from)));
}

/** Locks one space's row for the rest of the transaction. Every membership
 *  change and every invite claim takes this same lock, so they queue. */
async function lockHousehold(tx: Tx, householdId: string) {
  const [row] = await tx
    .select()
    .from(households)
    .where(eq(households.id, householdId))
    .for("update");
  return row ?? null;
}

export type SeparateRefusal = "not_member" | "alone" | "admin_cannot_leave" | "not_admin";

/**
 * Takes `targetId` out of `householdId` into a new space of their own: they
 * leave (`actorId === targetId`) or the person who runs the space removes
 * them.
 *
 * The new space is provisioned like a sign-up's, minus the trial: an owner
 * decision, so that leaving and coming back is not a way to reset fourteen
 * days. It gets the old space's trial end, never a later one, and its comp if
 * it had one, so the person keeps exactly the access they had. A subscription
 * does not follow them: it pays for the space they left.
 */
export async function separateMember(
  householdId: string,
  actorId: string,
  targetId: string,
): Promise<{ ok: true; householdId: string } | { ok: false; reason: SeparateRefusal }> {
  return dbPool.transaction(async (tx) => {
    const old = await lockHousehold(tx, householdId);
    if (!old) return { ok: false, reason: "not_member" };
    const members = await membersOf(tx, householdId);
    const target = members.find((m) => m.id === targetId);
    if (!target || !members.some((m) => m.id === actorId)) {
      return { ok: false, reason: "not_member" };
    }
    if (members.length < 2) return { ok: false, reason: "alone" };
    const { adminId } = spaceRoles(members);
    if (actorId === targetId && adminId === targetId) {
      return { ok: false, reason: "admin_cannot_leave" };
    }
    if (actorId !== targetId && adminId !== actorId) return { ok: false, reason: "not_admin" };
    const heir = members.find((m) => m.id !== targetId)!;

    const [created] = await tx
      .insert(households)
      .values({
        name: defaultHouseholdName(toLocale(target.locale)),
        timezone: old.timezone,
        week_starts_on: old.week_starts_on,
        trial_ends_at: old.trial_ends_at,
        plan_override: old.plan_override === "comp" ? "comp" : null,
      })
      .returning({ id: households.id });

    await moveMember(tx, {
      from: householdId,
      to: created.id,
      userId: targetId,
      heirId: heir.id,
      privatize: false,
    });
    return { ok: true, householdId: created.id };
  });
}

/** Everything about an invite its link can show, before anyone signs in: who
 *  sent it, into which space, for which address, until when. Null when the
 *  token is unknown, used or expired. */
export async function invitePreview(token: string) {
  if (!token) return null;
  const [row] = await db
    .select({
      householdId: householdInvites.household_id,
      email: householdInvites.email,
      expiresAt: householdInvites.expires_at,
      spaceName: households.name,
      inviterId: profiles.id,
      inviterName: profiles.display_name,
      inviterColor: profiles.color,
      inviterAvatar: profiles.avatar_url,
    })
    .from(householdInvites)
    .innerJoin(households, eq(households.id, householdInvites.household_id))
    .innerJoin(profiles, eq(profiles.id, householdInvites.invited_by))
    .where(
      and(
        eq(householdInvites.token, token),
        isNull(householdInvites.accepted_at),
        gt(householdInvites.expires_at, sql`now()`),
      ),
    );
  return row ?? null;
}

export type JoinRefusal =
  | "invalid"
  | "wrong_account"
  | "already_member"
  | "not_alone"
  | "own_plan"
  | "full";

/**
 * The checks joining has to pass, as a pure function so each refusal is a test.
 *
 * - The invite is for an address, and the address is the credential: a link
 *   forwarded to someone else must not seat them.
 * - Only a space of one can be folded into another. Someone who already shares
 *   theirs has to leave it first, or joining would split a pair silently.
 * - A subscription of their own that will renew would charge them for a space
 *   that is about to be deleted (owner decision: block until they cancel the
 *   renewal).
 */
export function joinRefusal(f: {
  inviteEmail: string;
  userEmail: string | null | undefined;
  fromHousehold: string;
  toHousehold: string;
  fromMembers: number;
  toMembers: number;
  ownSubscription: { status: string; cancel_at_period_end: boolean } | null;
}): JoinRefusal | null {
  if ((f.userEmail ?? "").trim().toLowerCase() !== f.inviteEmail.trim().toLowerCase()) {
    return "wrong_account";
  }
  if (f.fromHousehold === f.toHousehold) return "already_member";
  if (f.fromMembers > 1) return "not_alone";
  if (isLiveSubscription(f.ownSubscription?.status) && !f.ownSubscription?.cancel_at_period_end) {
    return "own_plan";
  }
  if (f.toMembers >= MAX_HOUSEHOLD_MEMBERS) return "full";
  return null;
}

/**
 * Joins the space an invite points at, bringing the person's own things.
 *
 * One transaction: the invite claim, the seat count, the move and the delete
 * of the space they leave either all happen or none do. Both spaces are locked
 * (in id order, so two crossing joins cannot deadlock), and the cap is counted
 * again under the lock, the same rule as the claim at sign-up.
 *
 * The space they came from is deleted, not kept empty: it held their trial
 * and nothing else, and an orphan household is a row that still grants access.
 */
export async function joinHousehold(
  token: string,
  userId: string,
  userEmail: string | null | undefined,
): Promise<{ ok: true; householdId: string } | { ok: false; reason: JoinRefusal }> {
  return dbPool.transaction(async (tx) => {
    const [invite] = await tx
      .select({
        id: householdInvites.id,
        householdId: householdInvites.household_id,
        email: householdInvites.email,
      })
      .from(householdInvites)
      .where(
        and(
          eq(householdInvites.token, token),
          isNull(householdInvites.accepted_at),
          gt(householdInvites.expires_at, sql`now()`),
        ),
      );
    if (!invite) return { ok: false, reason: "invalid" };
    const [me] = await tx
      .select({ householdId: profiles.household_id })
      .from(profiles)
      .where(eq(profiles.id, userId));
    if (!me) return { ok: false, reason: "invalid" };
    const from = me.householdId;
    const to = invite.householdId;

    for (const id of [from, to].sort()) await lockHousehold(tx, id);

    const count = async (hh: string) =>
      (
        await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(profiles)
          .where(eq(profiles.household_id, hh))
      )[0]?.n ?? 0;
    const [own] = await tx
      .select({
        status: subscriptions.status,
        cancel_at_period_end: subscriptions.cancel_at_period_end,
      })
      .from(subscriptions)
      .where(eq(subscriptions.household_id, from));

    const refusal = joinRefusal({
      inviteEmail: invite.email,
      userEmail,
      fromHousehold: from,
      toHousehold: to,
      fromMembers: await count(from),
      toMembers: await count(to),
      ownSubscription: own ?? null,
    });
    if (refusal) return { ok: false, reason: refusal };

    await moveMember(tx, { from, to, userId, heirId: null, privatize: true });

    const [claimed] = await tx
      .update(householdInvites)
      .set({ accepted_at: sql`now()` })
      .where(and(eq(householdInvites.id, invite.id), isNull(householdInvites.accepted_at)))
      .returning({ id: householdInvites.id });
    if (!claimed) throw new Error("invite claimed concurrently");

    // Nothing of anyone's should be left in the old space, since its only
    // member just moved out with everything they own. Swept anyway, leaf
    // first, so a row the move did not foresee cannot hold the delete up on
    // a foreign key; invites and the subscription row cascade.
    for (const child of [
      taskBlocks,
      subtasks,
      taskTimeEntries,
      taskComments,
      taskReactions,
      taskAttachments,
    ] as const) {
      await tx.delete(child).where(eq(child.household_id, from));
    }
    await tx.delete(tasks).where(eq(tasks.household_id, from));
    for (const table of [
      recurringTemplates,
      dailyNotes,
      weeklyNotes,
      objectives,
      stintLinks,
      channels,
    ] as const) {
      await tx.delete(table).where(eq(table.household_id, from));
    }
    await tx.delete(households).where(eq(households.id, from));

    return { ok: true, householdId: to };
  });
}

/** Which space a token points at, used or not: how the accept page tells "you
 *  are already in" (a brand-new account claimed it at sign-up) from "this
 *  link no longer works". */
export async function inviteHouseholdByToken(token: string) {
  if (!token) return null;
  const [row] = await db
    .select({ householdId: householdInvites.household_id })
    .from(householdInvites)
    .where(eq(householdInvites.token, token));
  return row?.householdId ?? null;
}
