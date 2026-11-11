/**
 * The safety net for multi-tenancy.
 *
 * When this app moved off Supabase it lost Row-Level Security: isolation is now
 * enforced in application code, by every query threading `householdId` through
 * from the session. That works right up until one query forgets — and a
 * forgotten scope is invisible in review, in types, and in every other test in
 * this repo, because they all run against a single tenant.
 *
 * So this file runs the *real* query functions against a *real* Postgres
 * (pglite) holding two households, and asserts that asking as household A never
 * returns a row belonging to household B. A missing `eq(household_id, …)` fails
 * here and nowhere else.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle/migrations");

const client = new PGlite();
const testDb = drizzle(client, { schema });

// The query modules import the Neon client at module load, which throws without
// DATABASE_URL. Point them at pglite instead — they are otherwise untouched, so
// what runs below is the same code that runs in production.
vi.mock("@/lib/db/client", () => ({ db: testDb, dbPool: testDb }));

const A = {
  household: "aaaaaaaa-0000-4000-8000-000000000001",
  user: "aaaaaaaa-0000-4000-8000-000000000002",
};
const B = {
  household: "bbbbbbbb-0000-4000-8000-000000000001",
  user: "bbbbbbbb-0000-4000-8000-000000000002",
};

const TODAY = "2026-08-25";

let tasksQueries: typeof import("./tasks");
let carryoverQueries: typeof import("./carryover");
let subscriptionQueries: typeof import("./subscriptions");

beforeAll(async () => {
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }
  }

  for (const t of [A, B]) {
    await client.exec(`
      insert into households (id) values ('${t.household}');
      insert into "user" (id, email) values ('${t.user}', '${t.user}@example.com');
      insert into profiles (id, household_id, display_name)
        values ('${t.user}', '${t.household}', 'user-${t.user.slice(0, 4)}');
    `);
  }

  tasksQueries = await import("./tasks");
  carryoverQueries = await import("./carryover");
  subscriptionQueries = await import("./subscriptions");

  // One private task and one *shared* task each. Shared matters: it is the one
  // case where a task legitimately crosses between people, so it is the most
  // likely to be let through across households by accident.
  for (const t of [A, B]) {
    for (const [shared, title] of [
      [false, `private-${t.user.slice(0, 4)}`],
      [true, `shared-${t.user.slice(0, 4)}`],
    ] as const) {
      await tasksQueries.insertTask(t.household, t.user, {
        title,
        plannedDate: TODAY,
        sortOrder: shared ? 2000 : 1000,
      });
    }
    await client.exec(
      `update tasks set shared = true where owner_id = '${t.user}' and title like 'shared-%'`,
    );
  }
});

/** Every title visible to B, so A's reads can be checked for any of them. */
const titlesOf = (rows: { title: string }[]) => rows.map((r) => r.title);
const leaksB = (rows: { title: string }[]) => titlesOf(rows).some((t) => t.endsWith("bbbb"));

describe("household isolation", () => {
  it("seeds both households so the assertions below mean something", async () => {
    const mine = await tasksQueries.tasksForDate(A.household, A.user, TODAY);
    const theirs = await tasksQueries.tasksForDate(B.household, B.user, TODAY);
    expect(titlesOf(mine).sort()).toEqual(["private-aaaa", "shared-aaaa"]);
    expect(titlesOf(theirs).sort()).toEqual(["private-bbbb", "shared-bbbb"]);
  });

  it("tasksForDate never returns another household's rows", async () => {
    expect(leaksB(await tasksQueries.tasksForDate(A.household, A.user, TODAY))).toBe(false);
  });

  it("tasksInRange never returns another household's rows", async () => {
    // This one projects columns rather than whole rows, so it is checked by
    // owner instead of title.
    const rows = await tasksQueries.tasksInRange(A.household, A.user, TODAY, TODAY);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.owner_id === A.user)).toBe(true);
  });

  it("searchTasks never returns another household's rows", async () => {
    // Searching a substring both households share is the sharpest version of
    // the question: only the household filter can separate these rows.
    const rows = await tasksQueries.searchTasks(A.household, A.user, "shared-");
    expect(titlesOf(rows)).toEqual(["shared-aaaa"]);
  });

  it("backlogTasks never returns another household's rows", async () => {
    await client.exec(
      `update tasks set planned_date = null where title in ('private-aaaa','private-bbbb')`,
    );
    expect(leaksB(await tasksQueries.backlogTasks(A.household, A.user))).toBe(false);
    await client.exec(
      `update tasks set planned_date = '${TODAY}' where title in ('private-aaaa','private-bbbb')`,
    );
  });

  it("rejects a cross-household write instead of applying it", async () => {
    const [victim] = await tasksQueries.tasksForDate(B.household, B.user, TODAY);

    // A knows B's task id — an id is not a secret — and asks to complete it.
    // Scoping turns that into zero matched rows, which surfaces as a throw.
    await expect(tasksQueries.toggleTaskDone(A.household, victim.id, true)).rejects.toThrow(
      "task not found",
    );

    const after = (await tasksQueries.tasksForDate(B.household, B.user, TODAY)).find(
      (t) => t.id === victim.id,
    );
    expect(after?.status).toBe("todo");
  });

  it("the carry-over sweep never picks up another household's rows", async () => {
    // Dated into the past so both households have something sweepable, then
    // swept as A: B's task must still be sitting where it was.
    await client.exec(`update tasks set planned_date = '2026-08-01'`);

    const moved = await carryoverQueries.sweepOverdue(A.household, A.user, TODAY);
    expect(moved.length).toBeGreaterThan(0);

    const stillPast = await client.query<{ n: number }>(
      `select count(*)::int as n from tasks where owner_id = '${B.user}' and planned_date = '2026-08-01'`,
    );
    expect(stillPast.rows[0].n).toBe(2);

    await client.exec(`update tasks set planned_date = '${TODAY}'`);
  });

  it("undoing a carry-over cannot be aimed across households", async () => {
    const [victim] = await tasksQueries.tasksForDate(B.household, B.user, TODAY);
    const restored = await carryoverQueries.restoreCarried(A.household, A.user, TODAY, [
      { id: victim.id, from: "2026-01-01" },
    ]);
    expect(restored).toBe(0);
  });

  it("overdueCount never counts another household's rows", async () => {
    await client.exec(`update tasks set planned_date = '2026-08-01'`);
    expect(await carryoverQueries.overdueCount(A.household, A.user, TODAY)).toBe(2);
    await client.exec(`update tasks set planned_date = '${TODAY}'`);
  });

  it("billing facts are read per household, never pooled", async () => {
    // A only has a subscription because B does not: the join has to keep them
    // apart, or one household's payment would unlock the other.
    await subscriptionQueries.upsertSubscription({
      householdId: A.household,
      providerSubscriptionId: "sub_a",
      providerCustomerId: "cus_a",
      status: "active",
      recurringInterval: "month",
      currentPeriodEnd: "2027-01-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    });

    expect((await subscriptionQueries.billingFacts(A.household))?.subscription?.status).toBe(
      "active",
    );
    expect((await subscriptionQueries.billingFacts(B.household))?.subscription).toBeNull();
    expect(await subscriptionQueries.getSubscription(B.household)).toBeNull();
  });

  it("a cross-household delete leaves the row alone", async () => {
    const before = await tasksQueries.tasksForDate(B.household, B.user, TODAY);
    await tasksQueries.deleteTask(A.household, before[0].id);
    const after = await tasksQueries.tasksForDate(B.household, B.user, TODAY);
    expect(after).toHaveLength(before.length);
  });
});

describe("Stint link", () => {
  const STINT_B = "cccccccc-0000-4000-8000-000000000001";

  it("never reads, moves, removes or unlinks another household's mirrored tasks", async () => {
    const stint = await import("./stint");
    await stint.saveStintLink(B.household, B.user, "stint_token_of_b");
    await client.exec(
      `update tasks set stint_task_id = '${STINT_B}', stint_status = 'todo' where title = 'private-bbbb'`,
    );
    const [bTask] = await testDb
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where((await import("drizzle-orm")).eq(schema.tasks.stint_task_id, STINT_B));

    expect(await stint.getStintLink(A.household, B.user)).toBeNull();
    expect(await stint.linkedTasks(A.household, A.user)).toEqual([]);
    expect(await stint.linkedTasks(A.household, B.user)).toEqual([]);
    expect(await stint.stintStateOf(A.household, A.user, bTask.id)).toBeNull();

    // Aimed at B's task with A's session: nothing may happen to it.
    await stint.applyStintPlan(A.household, A.user, "00000000-0000-4000-8000-000000000000", {
      create: [],
      update: [{ id: bTask.id, set: { title: "hijacked", stint_status: "done" } }],
      remove: [bTask.id],
      unlink: [],
    });
    await stint.setStintStatus(A.household, A.user, bTask.id, "done");
    await stint.deleteStintLink(A.household, B.user);

    const still = await stint.linkedTasks(B.household, B.user);
    expect(still).toHaveLength(1);
    expect(still[0]).toMatchObject({ title: "private-bbbb", stint_status: "todo" });
    expect(await stint.getStintLink(B.household, B.user)).not.toBeNull();
  });
});

describe("worked time", () => {
  // A second person in A's household: tracked time is personal, so the
  // household filter alone is not enough here. Sharing a task is exactly how
  // two people end up with rows on the same task and day.
  const A2 = "aaaaaaaa-0000-4000-8000-000000000003";

  it("only ever sums the asking user's own minutes, in their own household", async () => {
    await client.exec(`
      insert into "user" (id, email) values ('${A2}', '${A2}@example.com');
      insert into profiles (id, household_id, display_name) values ('${A2}', '${A.household}', 'user-a2');
    `);
    const [aShared] = (await tasksQueries.tasksForDate(A.household, A.user, TODAY)).filter((t) =>
      t.title.startsWith("shared-"),
    );
    const [bTask] = await tasksQueries.tasksForDate(B.household, B.user, TODAY);

    // Raw inserts: the write path uses Neon's batch(), which pglite lacks.
    await client.exec(`
      insert into task_time_entries (household_id, task_id, user_id, day, minutes) values
        ('${A.household}', '${aShared.id}', '${A.user}', '${TODAY}', 30),
        ('${A.household}', '${aShared.id}', '${A2}', '${TODAY}', 45),
        ('${B.household}', '${bTask.id}', '${B.user}', '${TODAY}', 90);
    `);

    expect(await tasksQueries.workedMinutesByDay(A.household, A.user, TODAY, TODAY)).toEqual([
      { day: TODAY, minutes: 30 },
    ]);
    expect(await tasksQueries.workedMinutesByDay(A.household, A2, TODAY, TODAY)).toEqual([
      { day: TODAY, minutes: 45 },
    ]);
    // B's own user id, asked through A's household: nothing, not B's 90.
    expect(await tasksQueries.workedMinutesByDay(A.household, B.user, TODAY, TODAY)).toEqual([]);
    expect(await tasksQueries.workedMinutesByDay(B.household, B.user, TODAY, TODAY)).toEqual([
      { day: TODAY, minutes: 90 },
    ]);
  });

  it("splits only the asking user's own minutes per task, in their own household", async () => {
    // Reuses the entries above: A 30 and A2 45 on A's shared task, B 90 on B's.
    // A category on both tasks, so the channel join is under test as well.
    await client.exec(`
      insert into channels (id, household_id, owner_id, name, color) values
        ('aaaaaaaa-0000-4000-8000-0000000000c1', '${A.household}', '${A.user}', 'chan-aaaa', '#111111'),
        ('bbbbbbbb-0000-4000-8000-0000000000c1', '${B.household}', '${B.user}', 'chan-bbbb', '#222222');
      update tasks set channel_id = 'aaaaaaaa-0000-4000-8000-0000000000c1', time_estimate_min = 20
        where household_id = '${A.household}';
      update tasks set channel_id = 'bbbbbbbb-0000-4000-8000-0000000000c1'
        where household_id = '${B.household}';
    `);

    const mine = await tasksQueries.trackedMinutesByTask(A.household, A.user, TODAY, TODAY);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      channel_id: "aaaaaaaa-0000-4000-8000-0000000000c1",
      channel_name: "chan-aaaa",
      estimate_min: 20,
      minutes: 30,
    });
    // The partner on the same shared task sees their own 45, never A's 30.
    expect(
      (await tasksQueries.trackedMinutesByTask(A.household, A2, TODAY, TODAY)).map(
        (r) => r.minutes,
      ),
    ).toEqual([45]);
    // B's user id through A's household: nothing, not B's 90 or B's category.
    expect(await tasksQueries.trackedMinutesByTask(A.household, B.user, TODAY, TODAY)).toEqual([]);
    const theirs = await tasksQueries.trackedMinutesByTask(B.household, B.user, TODAY, TODAY);
    expect(theirs.map((r) => [r.channel_name, r.minutes])).toEqual([["chan-bbbb", 90]]);
  });
});
