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
    await expect(tasksQueries.toggleTaskDone(A.household, A.user, victim.id, true)).rejects.toThrow(
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
    await tasksQueries.deleteTask(A.household, A.user, before[0].id);
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

describe("checkout recording", () => {
  it("cannot be aimed at a person in another household", async () => {
    // B's user id with A's household: the write must match nothing.
    await subscriptionQueries.recordCheckoutStarted(A.household, B.user);
    const theirs = await client.query<{ prefs: Record<string, unknown> }>(
      `select notification_prefs as prefs from profiles where id = '${B.user}'`,
    );
    expect(theirs.rows[0].prefs).not.toHaveProperty("checkout_started_at");

    await subscriptionQueries.recordCheckoutStarted(A.household, A.user);
    const mine = await client.query<{ prefs: Record<string, unknown> }>(
      `select notification_prefs as prefs from profiles where id = '${A.user}'`,
    );
    expect(mine.rows[0].prefs).toHaveProperty("checkout_started_at");
  });
});

/**
 * The one deliberate exception to everything above: the admin launch metrics
 * read across households. What keeps that safe is that only counts come out,
 * so the check here is the inverse of the others: both households are in the
 * numbers, and nothing that identifies either is in the result.
 */
describe("admin launch metrics", () => {
  it("count both households and return nothing that identifies either", async () => {
    const { launchMetrics } = await import("./admin-metrics");
    await client.exec(`
      update households set created_at = '2026-12-01T15:00:00Z', trial_ends_at = '2026-12-15T15:00:00Z';
    `);

    const metrics = await launchMetrics(new Date("2026-12-04T15:00:00Z"));
    expect(metrics.funnel.launch.trials).toBe(2);

    const json = JSON.stringify(metrics);
    for (const t of [A, B]) {
      expect(json).not.toContain(t.household);
      expect(json).not.toContain(t.user);
      expect(json).not.toContain(t.user.slice(0, 4)); // names, titles, channels
    }
    expect(json).not.toContain("@example.com");
    expect(json).not.toContain("sub_a");
    expect(json).not.toContain("cus_a");
  });
});

/**
 * Onboarding reads a marker, an override and "does this household have any
 * task" — the last one is an `exists` over the whole tasks table, which is
 * exactly the kind of subquery that forgets its household. A third household
 * with no tasks is the case that tells: A and B both have tasks, so a leaking
 * check would call C "already using the app" and skip its onboarding, and a
 * leaking marker write would onboard someone else.
 */
describe("onboarding", () => {
  const C = {
    household: "cccccccc-0000-4000-8000-000000000001",
    user: "cccccccc-0000-4000-8000-000000000002",
  };

  it("reads only the asking household's tasks, override and marker", async () => {
    const q = await import("./onboarding");
    await client.exec(`
      insert into households (id) values ('${C.household}');
      insert into "user" (id, email) values ('${C.user}', 'c@example.com');
      insert into profiles (id, household_id, display_name) values ('${C.user}', '${C.household}', 'user-cccc');
      update households set plan_override = 'comp' where id = '${B.household}';
    `);

    expect(await q.onboardingFacts(C.household, C.user)).toEqual({
      onboardedAt: null,
      planOverride: null,
      householdHasTasks: false,
    });
    expect(await q.onboardingFacts(A.household, A.user)).toMatchObject({
      planOverride: null,
      householdHasTasks: true,
    });
    // A user id paired with someone else's household: nothing at all.
    expect(await q.onboardingFacts(C.household, B.user)).toBeNull();
  });

  it("cannot mark a person in another household as onboarded", async () => {
    const q = await import("./onboarding");
    await q.markOnboarded(A.household, C.user);
    expect((await q.onboardingFacts(C.household, C.user))?.onboardedAt).toBeNull();

    await q.markOnboarded(C.household, C.user);
    const first = (await q.onboardingFacts(C.household, C.user))?.onboardedAt;
    expect(first).toBeTruthy();

    // Set once: a second call keeps the first date, and other prefs survive.
    await client.exec(
      `update profiles set notification_prefs = notification_prefs || '{"taskReminders": true}' where id = '${C.user}'`,
    );
    await q.markOnboarded(C.household, C.user);
    const prefs = await client.query<{ prefs: Record<string, unknown> }>(
      `select notification_prefs as prefs from profiles where id = '${C.user}'`,
    );
    expect(prefs.rows[0].prefs).toMatchObject({ taskReminders: true, onboarded_at: first });
  });
});

describe("account delete preflight", () => {
  it("counts only the asking household's members", async () => {
    const { householdMemberCount } = await import("./account");
    // A has two members after the worked-time setup above; B has its one.
    const a = await householdMemberCount(A.household);
    const b = await householdMemberCount(B.household);
    const rows = await client.query<{ h: string; n: number }>(
      "select household_id as h, count(*)::int as n from profiles group by household_id",
    );
    const real = new Map(rows.rows.map((r) => [r.h, r.n]));
    expect(a).toBe(real.get(A.household));
    expect(b).toBe(real.get(B.household));
  });
});

describe("block delete", () => {
  it("cannot delete another household's block, or hand back its calendar event", async () => {
    const blocks = await import("./task-blocks");
    const [theirTask] = await tasksQueries.tasksForDate(B.household, B.user, TODAY);
    const theirs = await blocks.createBlock(
      B.household,
      B.user,
      theirTask.id,
      `${TODAY}T10:00:00.000Z`,
      `${TODAY}T11:00:00.000Z`,
    );
    await blocks.setBlockCalendarEvent(B.household, B.user, theirs.id, "evt_b");

    // Asked as A: nothing deleted, no event id that would then be deleted
    // from somebody's Google Calendar.
    expect(await blocks.deleteBlock(A.household, A.user, theirs.id)).toBeNull();
    expect(await blocks.blockForCalendarSync(B.household, B.user, theirs.id)).not.toBeNull();

    expect(await blocks.deleteBlock(B.household, B.user, theirs.id)).toBe("evt_b");
  });
});

describe("AI usage", () => {
  it("cannot count a use against a person in another household", async () => {
    const { consumeAiQuota } = await import("./ai-usage");
    // B's user through A's household: refused, and nothing written to B.
    expect(await consumeAiQuota(A.household, B.user, "plan", TODAY, 5)).toBe(false);
    const theirs = await client.query<{ prefs: Record<string, unknown> }>(
      `select notification_prefs as prefs from profiles where id = '${B.user}'`,
    );
    expect(theirs.rows[0].prefs).not.toHaveProperty("ai_usage");

    expect(await consumeAiQuota(A.household, A.user, "plan", TODAY, 5)).toBe(true);
  });
});

describe("notification prefs merge", () => {
  it("keeps server-owned markers and only touches the given person", async () => {
    const profileQueries = await import("./profiles");
    await client.exec(
      `update profiles set notification_prefs = '{"ai_usage":{"count":7},"onboarded_at":"x"}'::jsonb where id = '${A.user}'`,
    );
    await profileQueries.mergeNotificationPrefs(A.user, { dailyPlan: false });
    const mine = await client.query<{ prefs: Record<string, unknown> }>(
      `select notification_prefs as prefs from profiles where id = '${A.user}'`,
    );
    expect(mine.rows[0].prefs).toMatchObject({
      ai_usage: { count: 7 },
      onboarded_at: "x",
      dailyPlan: false,
    });
    const theirs = await client.query<{ prefs: Record<string, unknown> | null }>(
      `select notification_prefs as prefs from profiles where id = '${B.user}'`,
    );
    expect(theirs.rows[0].prefs ?? {}).not.toHaveProperty("dailyPlan", false);
  });
});

/**
 * Two people in the SAME household.
 *
 * Everything above keeps households apart; this keeps the two people inside
 * one apart. Within a household a task is visible to its owner, and to the
 * other person only when it is shared — and tracked time is personal even on
 * a shared task. For a long time only the household was checked on the reads
 * by date and the writes by task id, so a partner's private task leaked
 * through its time blocks and checklist, and with that id it could be renamed,
 * completed or deleted. The household filter cannot catch any of that: both
 * people are in it.
 *
 * Fixture: S1 and S2 share household S. S1 has a private task, S2 has a
 * private task, and S2 owns a task shared with S1. S1 tracked 30 min on the
 * shared task, S2 tracked 45 there plus 20 undated, and 60 on their private.
 */
describe("two people in one household", () => {
  const S = "eeeeeeee-0000-4000-8000-000000000001";
  const S1 = "eeeeeeee-0000-4000-8000-0000000000a1";
  const S2 = "eeeeeeee-0000-4000-8000-0000000000b2";
  const DAY = "2026-09-10";
  const ids = { s1Private: "", s2Private: "", shared: "" };
  const child = { block: "", subtask: "", comment: "", reaction: "", attachment: "" };

  const taskRow = async (id: string) =>
    (
      await client.query<{
        title: string;
        status: string;
        household_id: string;
        owner_id: string;
        planned_date: string | null;
        actual_time_min: string | null;
      }>(
        `select title, status, household_id, owner_id, planned_date::text as planned_date,
           actual_time_min from tasks where id = '${id}'`,
      )
    ).rows[0];
  const n = async (sql: string) =>
    Number((await client.query<{ n: number }>(`select count(*)::int as n from ${sql}`)).rows[0].n);

  beforeAll(async () => {
    // pglite has no batch(); run the statements in order, which is all the
    // Neon batch promises beyond atomicity.
    (testDb as unknown as { batch: (qs: unknown[]) => Promise<unknown[]> }).batch = async (qs) => {
      const out: unknown[] = [];
      for (const q of qs) out.push(await q);
      return out;
    };

    await client.exec(`
      insert into households (id) values ('${S}');
      insert into "user" (id, email) values ('${S1}', 's1@example.com'), ('${S2}', 's2@example.com');
      insert into profiles (id, household_id, display_name, notification_prefs) values
        ('${S1}', '${S}', 'user-s1', '{}'),
        ('${S2}', '${S}', 'user-s2', '{"ai_usage":{"count":3},"taskReminders":true}');
    `);
    const mk = async (owner: string, title: string) =>
      (await tasksQueries.insertTask(S, owner, { title, plannedDate: DAY, sortOrder: 1 })).id;
    ids.s1Private = await mk(S1, "s1-private");
    ids.s2Private = await mk(S2, "s2-private-secret");
    ids.shared = await mk(S2, "s2-shared");
    await client.exec(`
      update tasks set shared = true where id = '${ids.shared}';
      insert into task_time_entries (household_id, task_id, user_id, day, minutes) values
        ('${S}', '${ids.shared}', '${S1}', '${DAY}', 30),
        ('${S}', '${ids.shared}', '${S2}', '${DAY}', 45),
        ('${S}', '${ids.s2Private}', '${S2}', '${DAY}', 60);
      update tasks set actual_time_min = 95 where id = '${ids.shared}';
      update tasks set actual_time_min = 60 where id = '${ids.s2Private}';
    `);

    const blocks = await import("./task-blocks");
    const subs = await import("./subtasks");
    const comments = await import("./comments");
    const reactions = await import("./reactions");
    const attachments = await import("./attachments");
    child.block = (
      await blocks.createBlock(S, S2, ids.s2Private, `${DAY}T14:00:00Z`, `${DAY}T15:00:00Z`)
    ).id;
    child.subtask = (
      await subs.createSubtask(S, S2, ids.s2Private, { title: "s2-secret-item", sortOrder: 1 })
    ).id;
    child.comment = (await comments.addComment(S, ids.s2Private, S2, "s2-secret-comment")).id;
    await reactions.addReaction(S, ids.s2Private, S2, "🔒");
    child.reaction = (
      await client.query<{ id: string }>(
        `select id from task_reactions where task_id = '${ids.s2Private}'`,
      )
    ).rows[0].id;
    child.attachment = (
      await attachments.addAttachment(S, ids.s2Private, S2, {
        url: "https://blob/s2",
        pathname: "s2",
        name: "s2-secret.pdf",
        contentType: "application/pdf",
        sizeBytes: 1,
      })
    ).id;
  });

  describe("reads", () => {
    it("task lists show S1 their own and the shared task, never S2's private one", async () => {
      const titles = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
      const expected = [ids.s1Private, ids.shared].sort();
      expect(titles(await tasksQueries.tasksForDate(S, S1, DAY))).toEqual(expected);
      expect(titles(await tasksQueries.tasksInRange(S, S1, DAY, DAY))).toEqual(expected);
      expect(titles(await tasksQueries.searchTasks(S, S1, "s2-"))).toEqual([ids.shared]);
      expect(await tasksQueries.monthCounts(S, S1, DAY, DAY)).toHaveLength(2);
    });

    it("blocks and checklists for a date never include S2's private task", async () => {
      const blocks = await import("./task-blocks");
      const subs = await import("./subtasks");
      expect(await blocks.listForDate(S, S1, DAY)).toEqual([]);
      expect(await subs.listForDate(S, S1, DAY)).toEqual([]);
      // S2 still sees their own.
      expect((await blocks.listForDate(S, S2, DAY)).map((b) => b.id)).toEqual([child.block]);
      expect((await subs.listForDate(S, S2, DAY)).map((s) => s.title)).toEqual(["s2-secret-item"]);
    });

    it("nothing hanging off S2's private task is readable by id", async () => {
      const subs = await import("./subtasks");
      const comments = await import("./comments");
      const reactions = await import("./reactions");
      const attachments = await import("./attachments");
      expect(await subs.listForTask(S, S1, ids.s2Private)).toEqual([]);
      expect(await comments.listComments(S, S1, ids.s2Private)).toEqual([]);
      expect(await reactions.listReactions(S, S1, ids.s2Private)).toEqual([]);
      expect(await attachments.listAttachments(S, S1, ids.s2Private)).toEqual([]);
      expect(await attachments.getAttachment(S, S1, child.attachment)).toBeNull();
      expect(await attachments.taskVisibleTo(S, S1, ids.s2Private)).toBe(false);
      expect(await tasksQueries.timeEntriesForTask(S, S1, ids.s2Private)).toEqual([]);
      const blocks = await import("./task-blocks");
      expect(await blocks.blockForCalendarSync(S, S1, child.block)).toBeNull();
    });

    it("S1 sees only their own minutes on the shared task, everywhere", async () => {
      const shared = (await tasksQueries.tasksForDate(S, S1, DAY)).find((t) => t.id === ids.shared);
      expect(shared?.actual_time_min).toBe(30);
      expect(
        (await tasksQueries.tasksInRange(S, S1, DAY, DAY)).find((t) => t.id === ids.shared)
          ?.actual_time_min,
      ).toBe(30);
      expect(await tasksQueries.timeEntriesForTask(S, S1, ids.shared)).toEqual([
        { day: DAY, minutes: 30, user_id: S1 },
      ]);
      // The owner sees their own 45 plus the 20 undated, not S1's 30.
      const theirs = (await tasksQueries.tasksForDate(S, S2, DAY)).find((t) => t.id === ids.shared);
      expect(theirs?.actual_time_min).toBe(65);
      expect(
        (await tasksQueries.timeEntriesForTask(S, S2, ids.shared)).map((e) => e.user_id),
      ).toEqual([S2]);
    });

    it("presence shows S2's running shared task with S1's minutes, not S2's", async () => {
      const presence = await import("./presence");
      await client.exec(`update tasks set active_since = now() where id = '${ids.shared}'`);
      const rows = await presence.partnerActiveTasks(S, S1);
      expect(rows.map((r) => [r.id, r.actual_time_min])).toEqual([[ids.shared, 30]]);
      await client.exec(`update tasks set active_since = null where id = '${ids.shared}'`);
    });

    it("a goal counts neither S2's private tasks nor S2's minutes", async () => {
      const objectives = await import("./objectives");
      const goal = await objectives.createObjective(S, S1, {
        title: "s1 goal",
        period: "week",
        start_date: DAY,
        end_date: DAY,
      });
      await client.exec(
        `update tasks set objective_id = '${goal.id}' where id in ('${ids.shared}', '${ids.s2Private}')`,
      );
      expect(await objectives.objectiveTaskCounts(S, S1)).toEqual([
        { objective_id: goal.id, status: "todo", actual_time_min: 30 },
      ]);
      // Goals are personal: S2 neither lists S1's goal nor counts toward it.
      expect(await objectives.listObjectives(S, S2)).toEqual([]);
      expect(await objectives.objectiveTaskCounts(S, S2)).toEqual([]);
      await client.exec(`update tasks set objective_id = null`);
    });

    it("the partner's profile comes without their settings", async () => {
      const profiles = await import("./profiles");
      const rows = await profiles.getHouseholdProfiles(S);
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(Object.keys(r).sort()).toEqual(
          ["avatar_url", "color", "display_name", "household_id", "id"].sort(),
        );
      }
      expect(JSON.stringify(rows)).not.toContain("ai_usage");
    });
  });

  describe("writes by task id", () => {
    it("cannot complete, edit, move, reorder or delete S2's private task", async () => {
      await expect(tasksQueries.toggleTaskDone(S, S1, ids.s2Private, true)).rejects.toThrow(
        "task not found",
      );
      await expect(
        tasksQueries.updateTask(S, S1, ids.s2Private, { title: "renamed by s1" }),
      ).rejects.toThrow("task not found");
      await tasksQueries.moveTaskToDate(S, S1, ids.s2Private, null, 5);
      await tasksQueries.reorderTask(S, S1, ids.s2Private, 5, "high");
      await tasksQueries.setActiveSince(S, S1, ids.s2Private, true);
      await tasksQueries.deleteTask(S, S1, ids.s2Private);
      await tasksQueries.deleteTaskBlocks(S, S1, ids.s2Private);

      const row = await taskRow(ids.s2Private);
      expect(row).toMatchObject({ title: "s2-private-secret", status: "todo", planned_date: DAY });
      expect(await n(`task_blocks where task_id = '${ids.s2Private}'`)).toBe(1);
    });

    it("cannot log or set time on S2's private task", async () => {
      await expect(
        tasksQueries.logTaskTime(S, S1, ids.s2Private, [{ day: DAY, minutes: 10 }]),
      ).rejects.toThrow("task not found");
      await expect(tasksQueries.setTaskDayTime(S, S1, ids.s2Private, DAY, 10)).rejects.toThrow(
        "task not found",
      );
      await expect(tasksQueries.setActualTime(S, S1, ids.s2Private, 999)).rejects.toThrow(
        "task not found",
      );
      expect(await n(`task_time_entries where task_id = '${ids.s2Private}'`)).toBe(1);
      expect(Number((await taskRow(ids.s2Private)).actual_time_min)).toBe(60);
    });

    it("cannot add to, change or remove anything hanging off S2's private task", async () => {
      const blocks = await import("./task-blocks");
      const subs = await import("./subtasks");
      const comments = await import("./comments");
      const reactions = await import("./reactions");
      const attachments = await import("./attachments");
      const file = { url: "u", pathname: "p", name: "n", contentType: "x", sizeBytes: 1 };

      for (const attempt of [
        blocks.createBlock(S, S1, ids.s2Private, `${DAY}T09:00:00Z`, `${DAY}T10:00:00Z`),
        blocks.updateBlock(S, S1, child.block, `${DAY}T01:00:00Z`, `${DAY}T02:00:00Z`),
        subs.createSubtask(S, S1, ids.s2Private, { title: "x", sortOrder: 1 }),
        comments.addComment(S, ids.s2Private, S1, "x"),
        reactions.addReaction(S, ids.s2Private, S1, "x"),
        attachments.addAttachment(S, ids.s2Private, S1, file),
      ]) {
        await expect(attempt).rejects.toThrow();
      }
      expect(await blocks.deleteBlock(S, S1, child.block)).toBeNull();
      await blocks.setBlockCalendarEvent(S, S1, child.block, "evt_hijack");
      await subs.updateSubtask(S, S1, child.subtask, { title: "hijacked" });
      await subs.toggleSubtask(S, S1, child.subtask, true);
      await subs.deleteSubtask(S, S1, child.subtask);
      await comments.deleteComment(S, S1, child.comment);
      await reactions.removeReaction(S, S1, child.reaction);
      expect(await attachments.deleteAttachment(S, S1, child.attachment)).toBeNull();

      const t = ids.s2Private;
      expect(await n(`task_blocks where task_id = '${t}' and gcal_event_id is null`)).toBe(1);
      expect(
        await n(`subtasks where task_id = '${t}' and title = 's2-secret-item' and not done`),
      ).toBe(1);
      expect(await n(`task_comments where task_id = '${t}'`)).toBe(1);
      expect(await n(`task_reactions where task_id = '${t}'`)).toBe(1);
      expect(await n(`task_attachments where task_id = '${t}'`)).toBe(1);
    });

    it("can still work on the shared task, without touching S2's time on it", async () => {
      const subs = await import("./subtasks");
      await tasksQueries.updateTask(S, S1, ids.shared, { notes: "s1 was here" });
      await subs.createSubtask(S, S1, ids.shared, { title: "s1 item", sortOrder: 1 });

      // S1 adds 15 to their day: the total grows by 15 and S2's undated 20
      // is not eaten (it is S2's, as owner).
      await tasksQueries.setTaskDayTime(S, S1, ids.shared, DAY, 45);
      expect(Number((await taskRow(ids.shared)).actual_time_min)).toBe(110);
      const asS2 = (await tasksQueries.tasksForDate(S, S2, DAY)).find((t) => t.id === ids.shared);
      expect(asS2?.actual_time_min).toBe(65);

      // "Real" by hand is the owner's: S1 is refused, S2 sets only their own.
      await expect(tasksQueries.setActualTime(S, S1, ids.shared, 5)).rejects.toThrow(
        "not the owner",
      );
      await tasksQueries.setActualTime(S, S2, ids.shared, 50);
      expect(Number((await taskRow(ids.shared)).actual_time_min)).toBe(95); // 50 + S1's 45
      const asS1 = (await tasksQueries.tasksForDate(S, S1, DAY)).find((t) => t.id === ids.shared);
      expect(asS1?.actual_time_min).toBe(45);
    });
  });

  describe("mass assignment", () => {
    it("updateTask ignores household, id, creator and timestamps, and refuses an outside owner", async () => {
      const before = await taskRow(ids.s1Private);
      await tasksQueries.updateTask(S, S1, ids.s1Private, {
        household_id: B.household,
        id: "eeeeeeee-0000-4000-8000-00000000dead",
        created_by: S2,
        created_at: "2000-01-01T00:00:00Z",
        actual_time_min: 999,
        gcal_event_id: "evt_x",
        reminder_sent_at: "2000-01-01T00:00:00Z",
        title: "renamed by s1",
      } as never);
      const after = await taskRow(ids.s1Private);
      expect(after).toMatchObject({
        household_id: S,
        owner_id: S1,
        title: "renamed by s1",
        actual_time_min: before.actual_time_min,
      });
      expect(
        await n(
          `tasks where id = '${ids.s1Private}' and gcal_event_id is null and reminder_sent_at is null and created_by = '${S1}'`,
        ),
      ).toBe(1);
      // A person from another household cannot be made the owner, nor can a
      // category from another household be attached.
      await expect(
        tasksQueries.updateTask(S, S1, ids.s1Private, { owner_id: B.user }),
      ).rejects.toThrow("task not found");
      await expect(
        tasksQueries.updateTask(S, S1, ids.s1Private, {
          channel_id: "bbbbbbbb-0000-4000-8000-0000000000c1",
        }),
      ).rejects.toThrow("task not found");
      // Handing a task to the partner still works: they are in the household.
      const handed = await tasksQueries.updateTask(S, S1, ids.s1Private, { owner_id: S2 });
      expect(handed.owner_id).toBe(S2);
      await client.exec(`update tasks set owner_id = '${S1}' where id = '${ids.s1Private}'`);
    });

    it("updateProfile cannot move anyone into another household", async () => {
      const profiles = await import("./profiles");
      await profiles.updateProfile(S1, {
        household_id: B.household,
        notification_prefs: { ai_usage: { count: 0 } },
        display_name: "s1 renamed",
      } as never);
      const row = (
        await client.query<{ household_id: string; display_name: string; prefs: object }>(
          `select household_id, display_name, notification_prefs as prefs from profiles where id = '${S1}'`,
        )
      ).rows[0];
      expect(row).toMatchObject({ household_id: S, display_name: "s1 renamed", prefs: {} });
    });

    it("a note patch naming the partner as owner writes only the caller's note", async () => {
      const daily = await import("./daily-notes");
      const weekly = await import("./weekly-notes");
      await daily.upsertDailyNote(S, S2, DAY, { reflection: "s2 private reflection" });
      await daily.upsertDailyNote(S, S1, DAY, {
        reflection: "written by s1",
        owner_id: S2,
        household_id: B.household,
      } as never);
      expect((await daily.getDailyNote(S2, DAY))?.reflection).toBe("s2 private reflection");
      expect(await daily.getDailyNote(S1, DAY)).toMatchObject({
        reflection: "written by s1",
        household_id: S,
      });
      // Same again once S1's note exists, so the UPDATE side of the upsert
      // gets the hostile patch too.
      await daily.upsertDailyNote(S, S1, DAY, {
        reflection: "edited by s1",
        owner_id: S2,
        note_date: "2026-01-01",
      } as never);
      expect((await daily.getDailyNote(S2, DAY))?.reflection).toBe("s2 private reflection");
      expect((await daily.getDailyNote(S1, DAY))?.reflection).toBe("edited by s1");

      await weekly.upsertWeeklyNote(S, S2, DAY, { wins: "s2 wins" });
      await weekly.upsertWeeklyNote(S, S1, DAY, { wins: "s1", owner_id: S2 } as never);
      expect((await weekly.getWeeklyNote(S2, DAY))?.wins).toBe("s2 wins");
    });

    it("routines, subtasks, goals and categories keep their owner, household and task", async () => {
      const routines = await import("./routines");
      const subs = await import("./subtasks");
      const objectives = await import("./objectives");
      const channels = await import("./channels");

      const r = await routines.createRoutine(S, S1, {
        title: "s1 routine",
        owner_id: S2,
        household_id: B.household,
        id: "eeeeeeee-0000-4000-8000-00000000beef",
      } as never);
      expect(r).toMatchObject({ owner_id: S1, household_id: S });
      expect(r.id).not.toBe("eeeeeeee-0000-4000-8000-00000000beef");
      const s2Routine = await routines.createRoutine(S, S2, { title: "s2 routine" });
      await routines.updateRoutine(S, S1, s2Routine.id, { title: "hijacked" });
      await routines.updateRoutine(S, S1, r.id, { owner_id: S2 } as never);
      await routines.deleteRoutine(S, S1, s2Routine.id);
      expect(
        await n(`recurring_templates where id = '${s2Routine.id}' and title = 's2 routine'`),
      ).toBe(1);
      expect(await n(`recurring_templates where id = '${r.id}' and owner_id = '${S1}'`)).toBe(1);

      const mine = await subs.createSubtask(S, S1, ids.s1Private, {
        title: "s1 item",
        sortOrder: 1,
      });
      await subs.updateSubtask(S, S1, mine.id, {
        task_id: ids.s2Private,
        household_id: B.household,
        title: "still mine",
      } as never);
      expect(
        await n(
          `subtasks where id = '${mine.id}' and task_id = '${ids.s1Private}' and household_id = '${S}' and title = 'still mine'`,
        ),
      ).toBe(1);
      await expect(subs.updateSubtask(S, S1, mine.id, { assignee_id: B.user })).rejects.toThrow(
        "not a member",
      );

      const goal = await objectives.createObjective(S, S2, {
        title: "s2 goal",
        period: "week",
        start_date: DAY,
        end_date: DAY,
        owner_id: S1,
      } as never);
      expect(goal.owner_id).toBe(S2);
      await objectives.updateObjective(S, S1, goal.id, { title: "hijacked" });
      await objectives.deleteObjective(S, S1, goal.id);
      await objectives.updateObjective(S, S2, goal.id, {
        owner_id: S1,
        title: "s2 goal!",
      } as never);
      expect(
        await n(`objectives where id = '${goal.id}' and owner_id = '${S2}' and title = 's2 goal!'`),
      ).toBe(1);

      const s2Channel = await channels.createChannel(S, S2, {
        name: "s2 chan",
        color: "#000000",
        sortOrder: 1,
      });
      await channels.updateChannel(S, S1, s2Channel.id, { name: "hijacked" });
      await channels.deleteChannel(S, S1, s2Channel.id);
      expect(await n(`channels where id = '${s2Channel.id}' and name = 's2 chan'`)).toBe(1);
    });
  });

  describe("membership reads", () => {
    it("count and list only the asking household's people and tasks", async () => {
      const membership = await import("./membership");
      // B's user asked about in A's household: nothing of B's is counted.
      expect(await membership.moveCounts(A.household, B.user)).toEqual({
        privateTasks: 0,
        sharedTasks: 0,
        sharedDated: 0,
        comments: 0,
      });
      expect(await membership.ownTaskCount(A.household, B.user)).toBe(0);
      const space = await membership.spaceMembers(A.household);
      const ids = space.members.map((m) => m.id);
      expect(ids).toContain(A.user);
      expect(ids).not.toContain(B.user);
    });

    it("never names another household's payer as this one's", async () => {
      // B pays for B, and a stale marker on B naming A must not make B A's payer.
      await subscriptionQueries.recordBillingManager(B.household, B.user);
      await client.exec(
        `update profiles set notification_prefs = notification_prefs || '{"billing_manager_for": "${A.household}"}' where id = '${B.user}'`,
      );
      expect(await subscriptionQueries.billingManager(A.household)).toBeNull();
      // And a webhook naming A's user as B's payer does nothing: A is not in B.
      await subscriptionQueries.recordBillingManager(B.household, A.user);
      const marked = await client.query<{ n: number }>(
        `select count(*)::int as n from profiles where id = '${A.user}' and notification_prefs ? 'billing_manager_for'`,
      );
      expect(marked.rows[0].n).toBe(0);
    });
  });
});
