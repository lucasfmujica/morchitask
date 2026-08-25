/**
 * Push subscriptions, against a real Postgres.
 *
 * Both cases below come from the same fact: a browser keeps one push
 * subscription per origin, so on a device two people share — which is what this
 * app is built for — the same endpoint string belongs to whoever signed in last.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const client = new PGlite();
const testDb = drizzle(client, { schema });
vi.mock("@/lib/db/client", () => ({ db: testDb, dbPool: testDb }));

let subs: typeof import("./push-subscriptions");

const HOUSEHOLD = "eeeeeeee-0000-4000-8000-000000000001";
const LUCAS = "eeeeeeee-0000-4000-8000-000000000002";
const SOFI = "eeeeeeee-0000-4000-8000-000000000003";
const ENDPOINT = "https://push.example.com/subscription/shared-phone";

const keysFor = (n: string) => ({ endpoint: ENDPOINT, p256dh: `p-${n}`, authKey: `a-${n}` });

const ownerOf = async (endpoint: string) => {
  const r = await client.query<{ profile_id: string }>(
    `select profile_id from push_subscriptions where endpoint = $1`,
    [endpoint],
  );
  return r.rows[0]?.profile_id ?? null;
};

beforeAll(async () => {
  const dir = join(process.cwd(), "drizzle/migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const stmt of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await client.exec(stmt);
    }
  }
  await client.exec(`insert into households (id) values ('${HOUSEHOLD}')`);
  for (const [id, name] of [
    [LUCAS, "Lucas"],
    [SOFI, "Sofi"],
  ]) {
    await client.exec(`
      insert into "user" (id, email) values ('${id}', '${name}@example.com');
      insert into profiles (id, household_id, display_name)
        values ('${id}', '${HOUSEHOLD}', '${name}');
    `);
  }
  subs = await import("./push-subscriptions");
});

describe("upsertSubscription", () => {
  it("moves the endpoint to whoever subscribed last on that device", async () => {
    await subs.upsertSubscription(LUCAS, keysFor("lucas"));
    expect(await ownerOf(ENDPOINT)).toBe(LUCAS);

    // Sofi signs in on the same phone; the browser hands back the same endpoint.
    await subs.upsertSubscription(SOFI, keysFor("sofi"));

    // Leaving this on Lucas would send her his reminders.
    expect(await ownerOf(ENDPOINT)).toBe(SOFI);
  });
});

describe("deleteSubscription", () => {
  it("removes your own subscription", async () => {
    const mine = "https://push.example.com/subscription/mine";
    await subs.upsertSubscription(LUCAS, { endpoint: mine, p256dh: "p", authKey: "a" });
    await subs.deleteSubscription(LUCAS, mine);
    expect(await ownerOf(mine)).toBeNull();
  });

  it("cannot remove someone else's, even knowing their endpoint", async () => {
    const hers = "https://push.example.com/subscription/hers";
    await subs.upsertSubscription(SOFI, { endpoint: hers, p256dh: "p", authKey: "a" });

    await subs.deleteSubscription(LUCAS, hers);

    expect(await ownerOf(hers)).toBe(SOFI);
  });
});
