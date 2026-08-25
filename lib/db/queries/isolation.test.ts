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

  it("a cross-household delete leaves the row alone", async () => {
    const before = await tasksQueries.tasksForDate(B.household, B.user, TODAY);
    await tasksQueries.deleteTask(A.household, before[0].id);
    const after = await tasksQueries.tasksForDate(B.household, B.user, TODAY);
    expect(after).toHaveLength(before.length);
  });
});
