import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dailyNotes, tasks } from "@/lib/db/schema";

/**
 * Bringing forward what an earlier day didn't finish.
 *
 * There was already a rollover, but it moved tasks from *one* named day to
 * another, and every caller passed "yesterday". On a Monday yesterday is
 * Sunday, which is empty — so Friday's leftovers sat on a date that Today never
 * shows and looked deleted. The same hole swallows a long weekend, a holiday
 * and a vacation. So the sweep here is defined by "before today", not by a
 * date someone had to guess right.
 *
 * Every read and write is scoped to `householdId` like the rest of the data
 * layer, and to `owner_id` on top of that: a shared task belongs to whoever
 * created it, and sweeping it would move it on their board too.
 */

/**
 * Claims today's sweep, returning true only for the caller that got there
 * first.
 *
 * The claim is the whole reason this is not just an UPDATE. The sweep runs by
 * itself when Today opens, so without a marker it would run again on every
 * visit and on every device — and undo would be theatre, since anything sent
 * back would come straight home on the next mount. `where carried_over_at is
 * null` is part of the UPDATE, so two tabs opening at once produce one sweep.
 */
export async function claimCarryover(householdId: string, ownerId: string, today: string) {
  const claimed = await db
    .insert(dailyNotes)
    .values({
      household_id: householdId,
      owner_id: ownerId,
      note_date: today,
      carried_over_at: sql`now()`,
    })
    .onConflictDoUpdate({
      target: [dailyNotes.owner_id, dailyNotes.note_date],
      set: { carried_over_at: sql`now()` },
      setWhere: isNull(dailyNotes.carried_over_at),
    })
    .returning({ id: dailyNotes.id });

  return claimed.length > 0;
}

export type CarriedTask = { id: string; from: string };

/**
 * Moves every unfinished task planned before `today` onto today.
 *
 * Returns where each one came from, which is what makes undo exact. The
 * existing `rollover_incomplete` returns only a count, and `rollover_origin_date`
 * keeps the *first* origin rather than the last, so neither can put a task back
 * where it was — undo would have to guess, and guessing wrong on someone's
 * calendar is worse than not offering undo at all.
 */
export async function sweepOverdue(
  householdId: string,
  ownerId: string,
  today: string,
): Promise<CarriedTask[]> {
  const result = await db.execute(sql`
    with overdue as (
      select id, planned_date
      from tasks
      where household_id = ${householdId}::uuid
        and owner_id = ${ownerId}::uuid
        and planned_date < ${today}::date
        and status = 'todo'
        and template_id is null
      for update
    )
    update tasks t
    set planned_date = ${today}::date,
        rollover_count = t.rollover_count + 1,
        rollover_origin_date = coalesce(t.rollover_origin_date, o.planned_date),
        -- A time block from last Tuesday means nothing today, and leaving it
        -- would drop the task onto the agenda at an hour nobody chose.
        block_start = null,
        block_end = null,
        updated_at = now()
    from overdue o
    where t.id = o.id
    -- to_char, not the bare column: the day has to survive as a calendar day.
    -- Drivers differ on what they hand back for \`date\` (a string on Neon, a
    -- Date on pglite), and a Date would cross the server-action boundary as an
    -- instant that can land on the previous day west of UTC.
    returning t.id as id, to_char(o.planned_date, 'YYYY-MM-DD') as "from"
  `);

  return result.rows as CarriedTask[];
}

/**
 * Puts swept tasks back on the days they came from.
 *
 * Only touches rows this person owns in this household and that are still on
 * `today` — if a task was rescheduled or completed between the sweep and the
 * undo, that later choice is the deliberate one and wins.
 */
export async function restoreCarried(
  householdId: string,
  ownerId: string,
  today: string,
  moves: CarriedTask[],
) {
  if (moves.length === 0) return 0;

  const cases = sql.join(
    moves.map((m) => sql`when ${m.id}::uuid then ${m.from}::date`),
    sql` `,
  );

  const result = await db.execute(sql`
    update tasks
    set planned_date = case id ${cases} end,
        rollover_count = greatest(rollover_count - 1, 0),
        updated_at = now()
    where household_id = ${householdId}::uuid
      and owner_id = ${ownerId}::uuid
      and planned_date = ${today}::date
      and id in ${sql`(${sql.join(
        moves.map((m) => sql`${m.id}::uuid`),
        sql`, `,
      )})`}
    returning id
  `);

  return result.rows.length;
}

/** How many unfinished tasks are sitting on days before `today`. Read-only —
 *  used to say "there are N waiting" without moving anything. */
export async function overdueCount(householdId: string, ownerId: string, today: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.household_id, householdId),
        eq(tasks.owner_id, ownerId),
        lt(tasks.planned_date, today),
        eq(tasks.status, "todo"),
        isNull(tasks.template_id),
      ),
    );
  return row?.n ?? 0;
}

/** The tasks themselves, for callers that need more than a count. */
export async function overdueTasks(householdId: string, ownerId: string, today: string) {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.household_id, householdId),
        eq(tasks.owner_id, ownerId),
        lt(tasks.planned_date, today),
        eq(tasks.status, "todo"),
        isNull(tasks.template_id),
      ),
    );
}
