/**
 * The cron's billing read and the once-only trial reminder claim, against a
 * real Postgres.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { resolveAccess } from "@/lib/billing";

const client = new PGlite();
const testDb = drizzle(client, { schema });
vi.mock("@/lib/db/client", () => ({ db: testDb, dbPool: testDb }));

const COMP = {
  h: "c0000000-0000-4000-8000-000000000001",
  u: "c0000000-0000-4000-8000-000000000002",
};
const TRIAL = {
  h: "d0000000-0000-4000-8000-000000000001",
  u: "d0000000-0000-4000-8000-000000000002",
};

let cron: typeof import("./cron");

beforeAll(async () => {
  const dir = join(process.cwd(), "drizzle/migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const st of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) {
      if (st.trim()) await client.exec(st);
    }
  }
  await client.exec(`
    insert into households (id, plan_override, trial_ends_at) values
      ('${COMP.h}', 'comp', null),
      ('${TRIAL.h}', null, now() + interval '2 days');
    insert into "user" (id, email) values ('${COMP.u}', 'c@example.com'), ('${TRIAL.u}', 't@example.com');
    insert into profiles (id, household_id, display_name, notification_prefs) values
      ('${COMP.u}', '${COMP.h}', 'c', '{}'),
      ('${TRIAL.u}', '${TRIAL.h}', 't', '{"dailyPlan": true}');
  `);
  cron = await import("./cron");
});

describe("profileBillingFacts", () => {
  it("gives every profile its household's facts, comp included", async () => {
    const facts = await cron.profileBillingFacts();
    expect(resolveAccess(facts.get(COMP.u)!).source).toBe("comp");
    expect(resolveAccess(facts.get(TRIAL.u)!).source).toBe("trial");
  });
});

describe("claimTrialReminders", () => {
  it("claims each person once, and keeps their other prefs", async () => {
    expect(await cron.claimTrialReminders([TRIAL.u])).toEqual([TRIAL.u]);
    expect(await cron.claimTrialReminders([TRIAL.u])).toEqual([]);
    const { rows } = await client.query<{ p: Record<string, unknown> }>(
      `select notification_prefs as p from profiles where id = '${TRIAL.u}'`,
    );
    expect(rows[0].p).toMatchObject({ dailyPlan: true });
    expect(rows[0].p).toHaveProperty("trial_reminder_sent_at");
  });
});

describe("claimDailyPlan", () => {
  const at = (iso: string) => new Date(iso);

  it("claims someone only once their own morning has started", async () => {
    await client.exec(
      `update profiles set timezone = 'Europe/Madrid', notification_prefs = '{"dailyPlan": true}' where id = '${COMP.u}';
       update profiles set timezone = 'America/Argentina/Buenos_Aires' where id = '${TRIAL.u}';`,
    );
    // 07:30 UTC on 16 Nov: 08:30 in Madrid, 04:30 in Buenos Aires.
    expect(await cron.claimDailyPlan([COMP.u, TRIAL.u], at("2026-11-16T07:30:00Z"))).toEqual([
      { id: COMP.u, day: "2026-11-16" },
    ]);
    // 11:00 UTC: 08:00 in Buenos Aires. Madrid (12:00) already had it and is past the window.
    expect(await cron.claimDailyPlan([COMP.u, TRIAL.u], at("2026-11-16T11:00:00Z"))).toEqual([
      { id: TRIAL.u, day: "2026-11-16" },
    ]);
  });

  it("claims nobody twice for the same local day, and again the next day", async () => {
    expect(await cron.claimDailyPlan([TRIAL.u], at("2026-11-16T12:30:00Z"))).toEqual([]);
    expect(await cron.claimDailyPlan([TRIAL.u], at("2026-11-17T11:05:00Z"))).toEqual([
      { id: TRIAL.u, day: "2026-11-17" },
    ]);
  });

  it("keeps the person's own prefs when it marks them", async () => {
    const rows = await client.query<{ p: Record<string, unknown> }>(
      `select notification_prefs as p from profiles where id = '${TRIAL.u}'`,
    );
    expect(rows.rows[0].p).toMatchObject({ dailyPlan: true, daily_plan_sent_for: "2026-11-17" });
  });

  it("uses the local day, not the UTC one", async () => {
    await client.exec(`update profiles set timezone = 'Pacific/Auckland' where id = '${COMP.u}'`);
    // 20:30 UTC on the 17th is 09:30 on the 18th in Auckland.
    expect(await cron.claimDailyPlan([COMP.u], at("2026-11-17T20:30:00Z"))).toEqual([
      { id: COMP.u, day: "2026-11-18" },
    ]);
  });
});

describe("dueTaskReminders", () => {
  const OTHER = "d0000000-0000-4000-8000-000000000003";
  const task = (id: string, extra: string) =>
    client.exec(
      `insert into tasks (id, household_id, owner_id, title, remind_at, shared, remind_by)
       values ('${id}', '${TRIAL.h}', '${TRIAL.u}', '${id}', now() - interval '1 minute', ${extra})`,
    );

  it("goes to whoever set it on a shared task, and to the owner otherwise", async () => {
    await client.exec(`
      insert into "user" (id, email) values ('${OTHER}', 'o@example.com');
      insert into profiles (id, household_id, display_name) values ('${OTHER}', '${TRIAL.h}', 'o');
    `);
    await task("e0000000-0000-4000-8000-000000000001", `true, '${OTHER}'`);
    // Private task: the other member cannot see it, so it cannot be theirs.
    await task("e0000000-0000-4000-8000-000000000002", `false, '${OTHER}'`);
    // Set before the column existed.
    await task("e0000000-0000-4000-8000-000000000003", `true, null`);
    // Set by someone from another household (they left).
    await task("e0000000-0000-4000-8000-000000000004", `true, '${COMP.u}'`);

    const due = await cron.dueTaskReminders(new Date().toISOString());
    const to = Object.fromEntries(due.map((d) => [d.id.slice(-1), d.recipient_id]));
    expect(to).toEqual({ "1": OTHER, "2": TRIAL.u, "3": TRIAL.u, "4": TRIAL.u });
  });
});
