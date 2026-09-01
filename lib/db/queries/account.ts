import { and, eq, inArray, sql } from "drizzle-orm";
import { db, dbPool } from "@/lib/db/client";
import {
  channels,
  dailyNotes,
  households,
  objectives,
  profiles,
  recurringTemplates,
  subtasks,
  taskAttachments,
  taskBlocks,
  taskComments,
  taskReactions,
  taskTimeEntries,
  tasks,
  users,
} from "@/lib/db/schema";

/**
 * Getting your data out, and getting yourself out.
 *
 * Both are legal obligations (GDPR arts. 15 and 17) and both are already
 * promised in the privacy policy, so the interesting part is not that they
 * exist — it is that they have to be *complete*. An export that quietly omits a
 * table, or a delete that leaves rows behind, is worse than not offering it:
 * it is a written claim that turns out not to be true.
 *
 * The scope of both is "what this person owns", not "what this person can
 * see". A shared task belongs to whoever created it; the other member's tasks
 * are not this person's data to take away, and deleting them would be taking
 * something from someone who did not ask for anything.
 */

/** Every row this person owns, ready to be written out as JSON. */
export async function exportAccount(householdId: string, userId: string) {
  const mine = <T extends { household_id: unknown; owner_id: unknown }>(t: T) =>
    and(eq(t.household_id as never, householdId), eq(t.owner_id as never, userId));

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
  const [household] = await db.select().from(households).where(eq(households.id, householdId));

  const [myTasks, myChannels, myObjectives, myNotes, myRoutines] = await Promise.all([
    db.select().from(tasks).where(mine(tasks)),
    db.select().from(channels).where(mine(channels)),
    db.select().from(objectives).where(mine(objectives)),
    db.select().from(dailyNotes).where(mine(dailyNotes)),
    db.select().from(recurringTemplates).where(mine(recurringTemplates)),
  ]);

  const taskIds = myTasks.map((t) => t.id);

  // Everything hanging off a task is fetched by task id rather than by owner:
  // a subtask or a comment has no owner column, it belongs to whoever owns the
  // task it is attached to.
  const [blocks, mySubtasks, comments, reactions, attachments, timeEntries] = await Promise.all([
    taskIds.length ? db.select().from(taskBlocks).where(inArray(taskBlocks.task_id, taskIds)) : [],
    taskIds.length ? db.select().from(subtasks).where(inArray(subtasks.task_id, taskIds)) : [],
    taskIds.length
      ? db.select().from(taskComments).where(inArray(taskComments.task_id, taskIds))
      : [],
    taskIds.length
      ? db.select().from(taskReactions).where(inArray(taskReactions.task_id, taskIds))
      : [],
    taskIds.length
      ? db.select().from(taskAttachments).where(inArray(taskAttachments.task_id, taskIds))
      : [],
    // Time entries are keyed by the person who tracked them, which is not
    // necessarily the task's owner — on a shared task, both of you can log time.
    db.select().from(taskTimeEntries).where(eq(taskTimeEntries.user_id, userId)),
  ]);

  return {
    profile: profile ?? null,
    // The space, but not the people in it: the other member's name and photo
    // are their data, not part of this export.
    household: household ? { name: household.name, timezone: household.timezone } : null,
    channels: myChannels,
    objectives: myObjectives,
    routines: myRoutines,
    daily_notes: myNotes,
    tasks: myTasks,
    task_blocks: blocks,
    subtasks: mySubtasks,
    task_comments: comments,
    task_reactions: reactions,
    // Only where the file is and what it was called — the bytes stay in Blob.
    task_attachments: attachments,
    task_time_entries: timeEntries,
  };
}

export type AccountExport = Awaited<ReturnType<typeof exportAccount>>;

/**
 * Erases the account, and the household with it when nobody is left.
 *
 * Order is the whole job here. Almost none of the foreign keys pointing at
 * `profiles` cascade — that is deliberate elsewhere in the schema, since it
 * stops a stray delete from taking half the household with it — so the rows
 * have to come out leaf-first, inside one transaction, or the delete fails
 * halfway and leaves an account that is neither alive nor gone.
 *
 * This is the first thing in the app to use `dbPool` — every other query goes
 * over Neon's one-shot HTTP driver, which has no transactions. Worth knowing
 * because it is also the first code path to open a WebSocket to Neon in
 * production, so a delete failing where everything else works points at the
 * connection, not at the SQL.
 *
 * Returns the blob paths the caller still has to clean up: the rows pointing at
 * those files are gone after this, so if they are not deleted now nothing will
 * ever point at them again.
 */
export async function deleteAccount(householdId: string, userId: string) {
  const [myAttachments, myTasks] = await Promise.all([
    db
      .select({ url: taskAttachments.url })
      .from(taskAttachments)
      .where(eq(taskAttachments.uploader_id, userId)),
    db.select({ id: tasks.id }).from(tasks).where(eq(tasks.owner_id, userId)),
  ]);
  const taskIds = myTasks.map((t) => t.id);

  await dbPool.transaction(async (tx) => {
    // 1. What this person left on *other people's* tasks. Their content, so it
    //    goes; the task it hangs off is not theirs, so the task stays.
    await tx.delete(taskComments).where(eq(taskComments.author_id, userId));
    await tx.delete(taskReactions).where(eq(taskReactions.author_id, userId));
    await tx.delete(taskAttachments).where(eq(taskAttachments.uploader_id, userId));
    await tx.delete(taskTimeEntries).where(eq(taskTimeEntries.user_id, userId));

    // 2. References on rows that survive. Nulled rather than deleted: a subtask
    //    assigned to the person leaving is still the other member's subtask.
    await tx.update(subtasks).set({ assignee_id: null }).where(eq(subtasks.assignee_id, userId));
    await tx.update(tasks).set({ created_by: null }).where(eq(tasks.created_by, userId));

    // 3. This person's tasks, which cascade to their blocks, subtasks,
    //    comments, reactions, attachments and time entries — including the ones
    //    the *other* member left on a shared task. Nothing else can reference
    //    them, so this is safe to do before the tables they point at.
    if (taskIds.length) await tx.delete(tasks).where(inArray(tasks.id, taskIds));

    // 4. The things tasks used to point at. Any surviving task belongs to the
    //    other member, and channels/objectives/routines are per-person, so
    //    nothing left should reference these — but a shared objective would,
    //    and a foreign key violation here would roll the whole delete back, so
    //    the references are cleared first rather than assumed absent.
    await tx
      .update(tasks)
      .set({ channel_id: null })
      .where(
        and(
          eq(tasks.household_id, householdId),
          sql`${tasks.channel_id} in (select id from ${channels} where owner_id = ${userId})`,
        ),
      );
    await tx
      .update(tasks)
      .set({ objective_id: null })
      .where(
        and(
          eq(tasks.household_id, householdId),
          sql`${tasks.objective_id} in (select id from ${objectives} where owner_id = ${userId})`,
        ),
      );
    await tx
      .update(tasks)
      .set({ template_id: null, template_date: null })
      .where(
        and(
          eq(tasks.household_id, householdId),
          sql`${tasks.template_id} in (select id from ${recurringTemplates} where owner_id = ${userId})`,
        ),
      );

    await tx.delete(recurringTemplates).where(eq(recurringTemplates.owner_id, userId));
    await tx.delete(dailyNotes).where(eq(dailyNotes.owner_id, userId));
    await tx.delete(objectives).where(eq(objectives.owner_id, userId));
    await tx.delete(channels).where(eq(channels.owner_id, userId));

    // 5. The account itself. Deleting the `user` row cascades to `profiles`
    //    (and to the auth `account` and `session` rows), which is what makes
    //    the still-valid session cookie in their browser stop working.
    await tx.delete(users).where(eq(users.id, userId));

    // 6. An empty household is not a space, it is an orphan row. Every table
    //    above is owned by a profile, so with no profiles left there is nothing
    //    else to clean up; pending invites cascade.
    const remaining = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(profiles)
      .where(eq(profiles.household_id, householdId));
    if ((remaining[0]?.n ?? 0) === 0) {
      await tx.delete(households).where(eq(households.id, householdId));
    }
  });

  return { blobUrls: myAttachments.map((a) => a.url) };
}
