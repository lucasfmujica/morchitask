/**
 * The sweep runs by itself, so it gets tested like something that runs by
 * itself: what it moves, what it refuses to move, and that it only happens once.
 *
 * The bug it exists to fix was invisible for months — Friday's leftovers landed
 * on a date Today never renders, so nothing looked broken, there was just less
 * on the screen than there should have been. That failure mode doesn't announce
 * itself, which is the argument for pinning it against a real Postgres (pglite)
 * rather than trusting the SQL by reading it.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle/migrations");

const client = new PGlite();
const testDb = drizzle(client, { schema });

vi.mock("@/lib/db/client", () => ({ db: testDb, dbPool: testDb }));

const H = "11111111-0000-4000-8000-000000000000";
const OTHER_H = "22222222-0000-4000-8000-000000000000";
const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const PARTNER = "bbbbbbbb-0000-4000-8000-000000000001";
const STRANGER = "cccccccc-0000-4000-8000-000000000001";

/** A Monday, so "yesterday" is a Sunday with nothing on it — the exact shape
 *  of the bug. FRIDAY is three days back. */
const MONDAY = "2026-08-24";
const FRIDAY = "2026-08-21";
const LAST_MONTH = "2026-07-15";

let carryover: typeof import("./carryover");

// pglite hands back a Date for `date` columns; the app never sees one because
// Drizzle is configured with mode "string". Formatted in SQL so the assertions
// compare a calendar day and not a timezone-shifted instant.
const plannedDate = async (id: string) =>
  (
    await client.query<{ d: string }>(
      `select to_char(planned_date, 'YYYY-MM-DD') as d from tasks where id = '${id}'`,
    )
  ).rows[0]?.d;

const task = (id: string, owner: string, household: string, day: string, extra = "") =>
  `insert into tasks (id, household_id, owner_id, title, planned_date${extra ? ", " + extra.split("=")[0] : ""})
     values ('${id}', '${household}', '${owner}', 'task-${id.slice(0, 4)}', '${day}'${extra ? ", " + extra.split("=")[1] : ""});`;

beforeEach(async () => {
  await client.exec("drop schema public cascade; create schema public;");
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const statement of readFileSync(join(MIGRATIONS_DIR, file), "utf8").split(
      "--> statement-breakpoint",
    )) {
      if (statement.trim()) await client.exec(statement);
    }
  }
  carryover ??= await import("./carryover");

  await client.exec(`
    insert into households (id) values ('${H}'), ('${OTHER_H}');
    insert into "user" (id, email) values
      ('${ME}','me@e.com'), ('${PARTNER}','p@e.com'), ('${STRANGER}','s@e.com');
    insert into profiles (id, household_id, display_name) values
      ('${ME}','${H}','Me'), ('${PARTNER}','${H}','Partner'), ('${STRANGER}','${OTHER_H}','Stranger');
    insert into recurring_templates (id, household_id, owner_id, title)
      values ('${ME}','${H}','${ME}','routine');
  `);
});

const id = (n: number) => `dddddddd-0000-4000-8000-00000000000${n}`;

describe("sweepOverdue", () => {
  it("reaches past the weekend, which is the whole point", async () => {
    await client.exec(task(id(1), ME, H, FRIDAY) + task(id(2), ME, H, LAST_MONTH));

    const moved = await carryover.sweepOverdue(H, ME, MONDAY);

    expect(moved.map((m) => m.id).sort()).toEqual([id(1), id(2)].sort());
    expect(await plannedDate(id(1))).toBe(MONDAY);
    expect(await plannedDate(id(2))).toBe(MONDAY);
  });

  it("says where each task came from, so undo can be exact", async () => {
    await client.exec(task(id(1), ME, H, FRIDAY) + task(id(2), ME, H, LAST_MONTH));
    const moved = await carryover.sweepOverdue(H, ME, MONDAY);
    expect(Object.fromEntries(moved.map((m) => [m.id, m.from]))).toEqual({
      [id(1)]: FRIDAY,
      [id(2)]: LAST_MONTH,
    });
  });

  it("leaves today, the future, the done and the routines alone", async () => {
    await client.exec(
      task(id(1), ME, H, MONDAY) +
        task(id(2), ME, H, "2026-08-25") +
        task(id(3), ME, H, FRIDAY, "status='done'") +
        task(id(4), ME, H, FRIDAY, `template_id='${ME}'`),
    );

    expect(await carryover.sweepOverdue(H, ME, MONDAY)).toEqual([]);
    expect(await plannedDate(id(3))).toBe(FRIDAY);
    expect(await plannedDate(id(4))).toBe(FRIDAY);
  });

  it("does not touch the other member's board, shared or not", async () => {
    await client.exec(
      task(id(1), PARTNER, H, FRIDAY) + task(id(2), PARTNER, H, FRIDAY, "shared=true"),
    );

    expect(await carryover.sweepOverdue(H, ME, MONDAY)).toEqual([]);
    expect(await plannedDate(id(1))).toBe(FRIDAY);
    expect(await plannedDate(id(2))).toBe(FRIDAY);
  });

  it("does not reach into another household", async () => {
    await client.exec(task(id(1), STRANGER, OTHER_H, FRIDAY));
    expect(await carryover.sweepOverdue(H, ME, MONDAY)).toEqual([]);
    expect(await plannedDate(id(1))).toBe(FRIDAY);
  });

  it("drops the stale time block — last Tuesday's 9am means nothing today", async () => {
    await client.exec(
      `insert into tasks (id, household_id, owner_id, title, planned_date, block_start, block_end)
       values ('${id(1)}','${H}','${ME}','blocked','${FRIDAY}',
               '2026-08-21T09:00:00Z','2026-08-21T10:00:00Z');`,
    );
    await carryover.sweepOverdue(H, ME, MONDAY);
    const [row] = (
      await client.query<{ block_start: string | null }>(
        `select block_start from tasks where id = '${id(1)}'`,
      )
    ).rows;
    expect(row.block_start).toBeNull();
  });

  it("keeps the first origin across repeated sweeps, not the last", async () => {
    await client.exec(task(id(1), ME, H, LAST_MONTH));
    await carryover.sweepOverdue(H, ME, FRIDAY);
    await carryover.sweepOverdue(H, ME, MONDAY);

    const [row] = (
      await client.query<{ rollover_origin_date: string; rollover_count: number }>(
        `select to_char(rollover_origin_date, 'YYYY-MM-DD') as rollover_origin_date,
                rollover_count
           from tasks where id = '${id(1)}'`,
      )
    ).rows;
    expect(row.rollover_origin_date).toBe(LAST_MONTH);
    expect(row.rollover_count).toBe(2);
  });
});

describe("claimCarryover", () => {
  it("only lets the first caller through", async () => {
    expect(await carryover.claimCarryover(H, ME, MONDAY)).toBe(true);
    expect(await carryover.claimCarryover(H, ME, MONDAY)).toBe(false);
  });

  it("is per person and per day", async () => {
    await carryover.claimCarryover(H, ME, MONDAY);
    expect(await carryover.claimCarryover(H, PARTNER, MONDAY)).toBe(true);
    expect(await carryover.claimCarryover(H, ME, "2026-08-25")).toBe(true);
  });

  it("does not disturb a note the person already wrote that day", async () => {
    await client.exec(
      `insert into daily_notes (household_id, owner_id, note_date, intention)
       values ('${H}','${ME}','${MONDAY}','ship the thing');`,
    );

    expect(await carryover.claimCarryover(H, ME, MONDAY)).toBe(true);

    const [row] = (
      await client.query<{ intention: string }>(
        `select intention from daily_notes where owner_id = '${ME}' and note_date = '${MONDAY}'`,
      )
    ).rows;
    expect(row.intention).toBe("ship the thing");
  });
});

describe("restoreCarried", () => {
  it("puts each task back on its own day, not on one shared day", async () => {
    await client.exec(task(id(1), ME, H, FRIDAY) + task(id(2), ME, H, LAST_MONTH));
    const moved = await carryover.sweepOverdue(H, ME, MONDAY);

    expect(await carryover.restoreCarried(H, ME, MONDAY, moved)).toBe(2);
    expect(await plannedDate(id(1))).toBe(FRIDAY);
    expect(await plannedDate(id(2))).toBe(LAST_MONTH);
  });

  it("undoes the rollover count it added", async () => {
    await client.exec(task(id(1), ME, H, FRIDAY));
    const moved = await carryover.sweepOverdue(H, ME, MONDAY);
    await carryover.restoreCarried(H, ME, MONDAY, moved);

    const [row] = (
      await client.query<{ rollover_count: number }>(
        `select rollover_count from tasks where id = '${id(1)}'`,
      )
    ).rows;
    expect(row.rollover_count).toBe(0);
  });

  it("respects a later decision — a task moved on since the sweep stays put", async () => {
    await client.exec(task(id(1), ME, H, FRIDAY));
    const moved = await carryover.sweepOverdue(H, ME, MONDAY);
    await client.exec(`update tasks set planned_date = '2026-08-26' where id = '${id(1)}'`);

    expect(await carryover.restoreCarried(H, ME, MONDAY, moved)).toBe(0);
    expect(await plannedDate(id(1))).toBe("2026-08-26");
  });

  it("cannot be aimed at someone else's task", async () => {
    await client.exec(task(id(1), PARTNER, H, MONDAY));
    expect(await carryover.restoreCarried(H, ME, MONDAY, [{ id: id(1), from: FRIDAY }])).toBe(0);
    expect(await plannedDate(id(1))).toBe(MONDAY);
  });
});

describe("overdueCount", () => {
  it("counts what is waiting without moving any of it", async () => {
    await client.exec(task(id(1), ME, H, FRIDAY) + task(id(2), ME, H, LAST_MONTH));
    expect(await carryover.overdueCount(H, ME, MONDAY)).toBe(2);
    expect(await plannedDate(id(1))).toBe(FRIDAY);
  });
});
