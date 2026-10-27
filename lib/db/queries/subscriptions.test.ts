/**
 * The mirror of what the payment provider says.
 *
 * Two things here are worth pinning against a real Postgres rather than
 * reasoning about: that a household which cancels and comes back does not
 * collide with its own old subscription row, and that `billingFacts` returns
 * something usable for a household that has never paid — which is every
 * household during its trial, and the shape that decides whether the app opens.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { resolveAccess } from "@/lib/billing";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle/migrations");
const client = new PGlite();
const testDb = drizzle(client, { schema });
vi.mock("@/lib/db/client", () => ({ db: testDb, dbPool: testDb }));

const H = "11111111-0000-4000-8000-000000000000";
const OTHER = "22222222-0000-4000-8000-000000000000";

let subs: typeof import("./subscriptions");

beforeEach(async () => {
  await client.exec("drop schema public cascade; create schema public;");
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const st of readFileSync(join(MIGRATIONS_DIR, file), "utf8").split(
      "--> statement-breakpoint",
    )) {
      if (st.trim()) await client.exec(st);
    }
  }
  subs ??= await import("./subscriptions");

  await client.exec(`
    insert into households (id, trial_ends_at, plan_override)
      values ('${H}', now() + interval '10 days', null),
             ('${OTHER}', null, null);
  `);
});

const upsert = (
  householdId: string,
  over: Partial<Parameters<typeof subs.upsertSubscription>[0]> = {},
) =>
  subs.upsertSubscription({
    householdId,
    providerSubscriptionId: "sub_1",
    providerCustomerId: "cus_1",
    status: "active",
    recurringInterval: "month",
    currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    ...over,
  });

describe("billingFacts", () => {
  it("describes a household on trial with no subscription", async () => {
    const facts = await subs.billingFacts(H);
    expect(facts?.subscription).toBeNull();
    expect(facts?.trialEndsAt).toBeTruthy();
    expect(resolveAccess(facts!).allowed).toBe(true);
  });

  it("locks out a household with neither trial nor subscription", async () => {
    const facts = await subs.billingFacts(OTHER);
    expect(resolveAccess(facts!).allowed).toBe(false);
  });

  it("carries the subscription once there is one", async () => {
    await upsert(H);
    const facts = await subs.billingFacts(H);
    expect(facts?.subscription).toEqual({
      status: "active",
      currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    });
  });

  it("treats a status it does not recognise as no subscription, rather than throwing", async () => {
    // The column is text on purpose: a provider that invents a status should
    // cost a support conversation, not a 500 on every page load.
    await upsert(H, { status: "quantum_superposition" });
    const facts = await subs.billingFacts(H);
    expect(facts?.subscription).toBeNull();
  });

  it("returns null for a household that does not exist", async () => {
    expect(await subs.billingFacts("33333333-0000-4000-8000-000000000000")).toBeNull();
  });

  it("never reports another household's subscription", async () => {
    await upsert(H);
    const facts = await subs.billingFacts(OTHER);
    expect(facts?.subscription).toBeNull();
  });
});

describe("upsertSubscription", () => {
  it("replaces the row when the same household resubscribes with a new id", async () => {
    await upsert(H, { providerSubscriptionId: "sub_old", status: "canceled" });
    await upsert(H, { providerSubscriptionId: "sub_new", status: "active" });

    const row = await subs.getSubscription(H);
    expect(row?.provider_subscription_id).toBe("sub_new");
    expect(row?.status).toBe("active");

    const all = await client.query<{ n: number }>("select count(*)::int as n from subscriptions");
    expect(all.rows[0].n).toBe(1);
  });

  it("keeps one row per household, not per event", async () => {
    await upsert(H, { status: "active" });
    await upsert(H, { status: "past_due" });
    expect((await subs.getSubscription(H))?.status).toBe("past_due");
  });

  it("maps a provider customer back to its household", async () => {
    await upsert(H, { providerCustomerId: "cus_abc" });
    expect(await subs.householdByCustomerId("cus_abc")).toBe(H);
    expect(await subs.householdByCustomerId("cus_nope")).toBeNull();
  });
});

describe("householdExists", () => {
  it("is what stops a webhook writing against an id from outside", async () => {
    expect(await subs.householdExists(H)).toBe(true);
    expect(await subs.householdExists("44444444-0000-4000-8000-000000000000")).toBe(false);
  });
});

describe("the migration that ships billing", () => {
  it("comps every household that already existed, so the deploy locks nobody out", async () => {
    // Re-run the shape of 0008's backfill against a household seeded before it:
    // this is the statement standing between "billing ships" and "the app's
    // only two users lose their calendars".
    await client.exec(
      `insert into households (id) values ('55555555-0000-4000-8000-000000000000');
       update households set plan_override = 'comp' where plan_override is null;`,
    );
    const facts = await subs.billingFacts("55555555-0000-4000-8000-000000000000");
    expect(resolveAccess(facts!).allowed).toBe(true);
    expect(resolveAccess(facts!).source).toBe("comp");
  });
});
