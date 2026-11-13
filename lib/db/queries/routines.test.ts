/**
 * Routine instances are generated on demand by `ensure_day_materialized`,
 * which skips a day whose (template_id, template_date) slot is already taken.
 * Two everyday actions used to fight that: deleting today's instance freed the
 * slot, so it came back the next time the day was opened, and moving it to
 * tomorrow left tomorrow's slot free, so tomorrow got a second one. Run
 * against a real Postgres (pglite) because the generator is SQL.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const client = new PGlite();
const testDb = drizzle(client, { schema });
vi.mock("@/lib/db/client", () => ({ db: testDb, dbPool: testDb }));

const H = "11111111-0000-4000-8000-0000000000aa";
const ME = "11111111-0000-4000-8000-0000000000a1";
const TODAY = "2026-11-13"; // a Friday
const TOMORROW = "2026-11-14";

let routines: typeof import("./routines");
let tasks: typeof import("./tasks");

const titlesOn = async (day: string) =>
  (await tasks.tasksForDate(H, ME, day)).map((t) => t.title).sort();

beforeAll(async () => {
  const dir = join(process.cwd(), "drizzle/migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const stmt of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await client.exec(stmt);
    }
  }
  await client.exec(`
    insert into households (id) values ('${H}');
    insert into "user" (id, email) values ('${ME}', 'me@example.com');
    insert into profiles (id, household_id, display_name) values ('${ME}', '${H}', 'me');
  `);
  routines = await import("./routines");
  tasks = await import("./tasks");
});

beforeEach(async () => {
  await client.exec(`delete from tasks; delete from recurring_templates;`);
});

describe("routine instances", () => {
  it("a deleted instance stays gone when the day is opened again", async () => {
    await routines.createRoutine(H, ME, { title: "gym", freq: "daily", active_from: "2026-11-01" });
    await routines.ensureDayMaterialized(H, ME, TODAY);
    const [gym] = await tasks.tasksForDate(H, ME, TODAY);

    await tasks.deleteTask(H, ME, gym.id);
    expect(await titlesOn(TODAY)).toEqual([]);
    await routines.ensureDayMaterialized(H, ME, TODAY);
    expect(await titlesOn(TODAY)).toEqual([]);
    // Hidden everywhere else too: counts and search.
    expect(await tasks.monthCounts(H, ME, TODAY, TODAY)).toEqual([]);
    expect(await tasks.searchTasks(H, ME, "gym")).toEqual([]);
    // Tomorrow is unaffected.
    await routines.ensureDayMaterialized(H, ME, TOMORROW);
    expect(await titlesOn(TOMORROW)).toEqual(["gym"]);
  });

  it("moving today's instance to tomorrow leaves one there, and none back today", async () => {
    await routines.createRoutine(H, ME, { title: "gym", freq: "daily", active_from: "2026-11-01" });
    await routines.ensureDayMaterialized(H, ME, TODAY);
    const [gym] = await tasks.tasksForDate(H, ME, TODAY);

    await tasks.moveTaskToDate(H, ME, gym.id, TOMORROW, 1);
    await routines.ensureDayMaterialized(H, ME, TOMORROW);
    await routines.ensureDayMaterialized(H, ME, TODAY);

    expect(await titlesOn(TOMORROW)).toEqual(["gym"]);
    expect(await titlesOn(TODAY)).toEqual([]);
    // The moved one now stands for tomorrow, so finishing it there counts
    // for tomorrow's streak.
    const [moved] = await tasks.tasksForDate(H, ME, TOMORROW);
    expect(moved.id).toBe(gym.id);
    expect(moved.template_date).toBe(TOMORROW);
  });

  it("moving onto a day the routine does not run on just moves it", async () => {
    // Fridays only: Saturday has no instance of its own to collide with.
    await routines.createRoutine(H, ME, {
      title: "review",
      freq: "weekly",
      weekdays: [5],
      active_from: "2026-11-01",
    });
    await routines.ensureDayMaterialized(H, ME, TODAY);
    const [review] = await tasks.tasksForDate(H, ME, TODAY);

    await tasks.moveTaskToDate(H, ME, review.id, TOMORROW, 1);
    await routines.ensureDayMaterialized(H, ME, TODAY);
    await routines.ensureDayMaterialized(H, ME, TOMORROW);

    expect(await titlesOn(TOMORROW)).toEqual(["review"]);
    expect(await titlesOn(TODAY)).toEqual([]);
    expect((await tasks.tasksForDate(H, ME, TOMORROW))[0].template_date).toBe(TODAY);
  });

  it("an ordinary task is still really deleted", async () => {
    const t = await tasks.insertTask(H, ME, { title: "one-off", plannedDate: TODAY, sortOrder: 1 });
    await tasks.deleteTask(H, ME, t.id);
    const left = await client.query<{ n: number }>(
      `select count(*)::int as n from tasks where id = '${t.id}'`,
    );
    expect(left.rows[0].n).toBe(0);
  });

  it("a routine with instances can be deleted, keeping the instances as plain tasks", async () => {
    const r = await routines.createRoutine(H, ME, {
      title: "gym",
      freq: "daily",
      active_from: "2026-11-01",
    });
    await routines.ensureDayMaterialized(H, ME, TODAY);
    await routines.ensureDayMaterialized(H, ME, TOMORROW);
    const [today] = await tasks.tasksForDate(H, ME, TODAY);
    await tasks.deleteTask(H, ME, today.id); // leaves a skipped placeholder

    await routines.deleteRoutine(H, ME, r.id);

    expect(await routines.listMyRoutines(H, ME)).toEqual([]);
    const [kept] = await tasks.tasksForDate(H, ME, TOMORROW);
    expect(kept).toMatchObject({ title: "gym", template_id: null });
    const left = await client.query<{ n: number }>(
      `select count(*)::int as n from tasks where status = 'cancelled'`,
    );
    expect(left.rows[0].n).toBe(0);
  });
});
