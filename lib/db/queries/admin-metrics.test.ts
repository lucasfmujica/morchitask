/**
 * The admin launch metrics against a real Postgres (pglite).
 *
 * These are the app's only cross-household reads, so two things are checked:
 * that the counts are right, and that the result is made of counts and dates
 * and nothing else. The second one is the reason this module is allowed to
 * exist; a field that identifies someone would turn an aggregate dashboard
 * into a list of customers.
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

vi.mock("@/lib/db/client", () => ({ db: testDb, dbPool: testDb }));

const id = (n: number, k: number) => `${String(n).repeat(8)}-0000-4000-8000-00000000000${k}`;

/** Each household with a person, a task, and something identifying in every
 *  free-text column, so a leak has something to leak. */
type Seed = {
  n: number;
  createdAt: string;
  trialEndsAt: string | null;
  comp?: boolean;
  tracked?: string[];
  closed?: string[];
  checkout?: boolean;
  sub?: { status: string; interval: string; cancelAtPeriodEnd?: boolean };
};

// "Now" is Dec 20, 2026 at noon in Buenos Aires.
const NOW = new Date("2026-12-20T15:00:00Z");

const SEEDS: Seed[] = [
  // Activated (two tracked days + one closed), opened checkout, pays monthly.
  {
    n: 1,
    createdAt: "2026-12-01T13:00:00Z",
    trialEndsAt: "2026-12-15T13:00:00Z",
    tracked: ["2026-12-01", "2026-12-02"],
    closed: ["2026-12-03"],
    checkout: true,
    sub: { status: "active", interval: "month" },
  },
  // Did nothing; the trial ran out unpaid.
  { n: 2, createdAt: "2026-12-02T13:00:00Z", trialEndsAt: "2026-12-16T13:00:00Z" },
  // Paid yearly, then cancelled. Tracked a lot, but only from day 8 on.
  {
    n: 3,
    createdAt: "2026-12-03T13:00:00Z",
    trialEndsAt: "2026-12-17T13:00:00Z",
    tracked: ["2026-12-10", "2026-12-11", "2026-12-12"],
    sub: { status: "canceled", interval: "year" },
  },
  // Pays yearly and is set to stop.
  {
    n: 4,
    createdAt: "2026-12-14T13:00:00Z",
    trialEndsAt: "2026-12-28T13:00:00Z",
    sub: { status: "active", interval: "year", cancelAtPeriodEnd: true },
  },
  // Comped: active every day, never a trial. Not part of the funnel.
  {
    n: 5,
    createdAt: "2026-12-01T13:00:00Z",
    trialEndsAt: null,
    comp: true,
    tracked: ["2026-12-01", "2026-12-02", "2026-12-03"],
  },
  // Signed up before launch.
  { n: 6, createdAt: "2026-11-10T13:00:00Z", trialEndsAt: "2026-11-24T13:00:00Z" },
];

let metrics: Awaited<ReturnType<typeof import("./admin-metrics").launchMetrics>>;
let subscriptions: typeof import("./subscriptions");

beforeAll(async () => {
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }
  }

  subscriptions = await import("./subscriptions");

  for (const s of SEEDS) {
    const [h, u, t] = [id(s.n, 1), id(s.n, 2), id(s.n, 3)];
    const trial = s.trialEndsAt ? `'${s.trialEndsAt}'` : "null";
    await client.exec(`
      insert into households (id, name, created_at, trial_ends_at, plan_override)
        values ('${h}', 'Casa secreta ${s.n}', '${s.createdAt}', ${trial}, ${s.comp ? "'comp'" : "null"});
      insert into "user" (id, email, name) values ('${u}', 'person${s.n}@private.test', 'Nombre Secreto ${s.n}');
      insert into profiles (id, household_id, display_name) values ('${u}', '${h}', 'Nombre Secreto ${s.n}');
      insert into tasks (id, household_id, owner_id, title, planned_date)
        values ('${t}', '${h}', '${u}', 'Titulo secreto ${s.n}', '2026-12-01');
    `);
    for (const day of s.tracked ?? []) {
      await client.exec(`
        insert into task_time_entries (household_id, task_id, user_id, day, minutes)
          values ('${h}', '${t}', '${u}', '${day}', 137);
      `);
    }
    for (const day of s.closed ?? []) {
      await client.exec(`
        insert into daily_notes (household_id, owner_id, note_date, reflection, shutdown_completed_at)
          values ('${h}', '${u}', '${day}', 'Reflexion secreta ${s.n}', '${day}T23:00:00Z');
      `);
    }
    if (s.checkout) await subscriptions.recordCheckoutStarted(h, u);
    if (s.sub) {
      await subscriptions.upsertSubscription({
        householdId: h,
        providerSubscriptionId: `sub_secret_${s.n}`,
        providerCustomerId: `cus_secret_${s.n}`,
        status: s.sub.status,
        recurringInterval: s.sub.interval,
        currentPeriodEnd: "2027-01-01T00:00:00Z",
        cancelAtPeriodEnd: s.sub.cancelAtPeriodEnd ?? false,
      });
    }
  }

  const { launchMetrics } = await import("./admin-metrics");
  metrics = await launchMetrics(NOW);
});

describe("launch metrics: the numbers", () => {
  it("counts the funnel over households that signed up since launch", () => {
    expect(metrics.funnel.launch).toMatchObject({
      trials: 4,
      activated: 1,
      checkout: 3,
      paid: 3,
      churned: 2,
      expiredUnpaid: 1,
    });
  });

  it("leaves comped households out and keeps pre-launch ones in 'all'", () => {
    expect(metrics.funnel.all.trials).toBe(5);
    expect(metrics.funnel.all.expiredUnpaid).toBe(2);
  });

  it("narrows to the last seven days", () => {
    expect(metrics.funnel.week.trials).toBe(1);
    expect(metrics.funnel.week.paid).toBe(1);
  });

  it("splits sign-ups into Monday weeks", () => {
    expect(metrics.funnel.launch.weeks).toEqual([
      { weekStart: "2026-11-30", signups: 3, activated: 1, paid: 2 },
      { weekStart: "2026-12-14", signups: 1, activated: 0, paid: 1 },
    ]);
  });

  it("adds up revenue from what is paying now, at list price", () => {
    // One monthly ($10) and one yearly ($80 / 12); the cancelled one is out.
    expect(metrics.revenue).toEqual({ mrrUsd: 17, payingMonthly: 1, payingYearly: 1 });
  });

  it("counts towards the cut criterion", () => {
    expect(metrics.today).toBe("2026-12-20");
    expect(metrics.cut).toEqual({
      cutDay: "2027-01-28",
      day: 21,
      totalDays: 46,
      payments: 2,
      target: 15,
    });
  });
});

describe("launch metrics: nothing but counts", () => {
  const DAY = /^\d{4}-\d{2}-\d{2}$/;

  /** Every leaf of the result, with the path that leads to it. */
  function leaves(v: unknown, path = "metrics"): [string, unknown][] {
    if (Array.isArray(v)) return v.flatMap((x, i) => leaves(x, `${path}[${i}]`));
    if (v && typeof v === "object") {
      return Object.entries(v).flatMap(([k, x]) => leaves(x, `${path}.${k}`));
    }
    return [[path, v]];
  }

  it("is made only of numbers and calendar days", () => {
    for (const [path, v] of leaves(metrics)) {
      const ok =
        (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && DAY.test(v));
      expect(ok, `${path} = ${JSON.stringify(v)}`).toBe(true);
    }
  });

  it("has no field that could name someone", () => {
    const keys = (JSON.stringify(metrics).match(/"[^"]+":/g) ?? []).map((k) => k.slice(1, -2));
    // Whole-word "id" only: "paid" is a count, not an identifier.
    const identifier = /^id$|Id$|_id$/;
    const banned = /email|name|title|user|owner|household|customer|minute|note/i;
    for (const k of keys) {
      expect(k).not.toMatch(identifier);
      expect(k).not.toMatch(banned);
    }
  });

  it("contains none of the seeded identifying values", () => {
    const json = JSON.stringify(metrics);
    for (const s of SEEDS) {
      expect(json).not.toContain(id(s.n, 1));
      expect(json).not.toContain(id(s.n, 2));
    }
    for (const secret of ["secret", "Secreto", "secreta", "private.test", "137"]) {
      expect(json).not.toContain(secret);
    }
  });
});

describe("recording a checkout start", () => {
  it("keeps the first timestamp and the person's real preferences", async () => {
    const u = id(1, 2);
    await client.exec(
      `update profiles set notification_prefs = notification_prefs || '{"taskReminders": true}' where id = '${u}'`,
    );
    const before = await client.query<{ prefs: Record<string, unknown> }>(
      `select notification_prefs as prefs from profiles where id = '${u}'`,
    );
    await subscriptions.recordCheckoutStarted(id(1, 1), u);
    const after = await client.query<{ prefs: Record<string, unknown> }>(
      `select notification_prefs as prefs from profiles where id = '${u}'`,
    );
    expect(after.rows[0].prefs.checkout_started_at).toBe(before.rows[0].prefs.checkout_started_at);
    expect(after.rows[0].prefs.taskReminders).toBe(true);
  });
});
