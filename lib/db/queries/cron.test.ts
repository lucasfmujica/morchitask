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
