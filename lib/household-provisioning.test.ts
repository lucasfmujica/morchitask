/**
 * Tests for the multi-tenancy boundary, against a real Postgres.
 *
 * The bug this guards against shipped and sat in `main`: `createUser` placed
 * every new sign-in into the oldest existing household, so the third person to
 * ever sign up would have opened the app inside the first two people's data.
 * The first test below is that exact scenario.
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

let provisionNewUser: typeof import("./household-provisioning").provisionNewUser;

/** The Adapter inserts the user row before the createUser event fires. */
let seq = 0;
async function signUp(email: string) {
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  await client.exec(`insert into "user" (id, email) values ('${id}', '${email}')`);
  const householdId = await provisionNewUser({ id, email, name: email.split("@")[0] });
  return { id, householdId };
}

const countIn = async (householdId: string, table: string) => {
  const res = await client.query<{ n: number }>(
    `select count(*)::int as n from ${table} where household_id = $1`,
    [householdId],
  );
  return res.rows[0].n;
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
  ({ provisionNewUser } = await import("./household-provisioning"));
});

describe("provisionNewUser", () => {
  it("gives each new account its own household", async () => {
    const first = await signUp("first@example.com");
    const second = await signUp("second@example.com");
    const third = await signUp("third@example.com");

    // The regression: all three used to land in `first`'s household.
    expect(second.householdId).not.toBe(first.householdId);
    expect(third.householdId).not.toBe(first.householdId);
    expect(third.householdId).not.toBe(second.householdId);
  });

  it("seeds default categories for every household, not just the first", async () => {
    const first = await signUp("cats-first@example.com");
    const second = await signUp("cats-second@example.com");

    expect(await countIn(first.householdId, "channels")).toBe(3);
    expect(await countIn(second.householdId, "channels")).toBe(3);
  });

  it("puts an invited address into the inviting household", async () => {
    const host = await signUp("host@example.com");
    await client.exec(`
      insert into household_invites (household_id, invited_by, email, token, expires_at)
      values ('${host.householdId}', '${host.id}', 'guest@example.com', 'tok-ok', now() + interval '7 days')
    `);

    const guest = await signUp("guest@example.com");
    expect(guest.householdId).toBe(host.householdId);
    // And the guest still gets their own categories inside the shared space.
    expect(await countIn(host.householdId, "channels")).toBe(6);
  });

  it("matches the invite regardless of the case the address is typed in", async () => {
    const host = await signUp("host-case@example.com");
    await client.exec(`
      insert into household_invites (household_id, invited_by, email, token, expires_at)
      values ('${host.householdId}', '${host.id}', 'mixed@example.com', 'tok-case', now() + interval '7 days')
    `);

    const guest = await signUp("MiXeD@Example.com");
    expect(guest.householdId).toBe(host.householdId);
  });

  it("ignores an expired invite and makes a fresh household instead", async () => {
    const host = await signUp("host-exp@example.com");
    await client.exec(`
      insert into household_invites (household_id, invited_by, email, token, expires_at)
      values ('${host.householdId}', '${host.id}', 'late@example.com', 'tok-exp', now() - interval '1 day')
    `);

    const late = await signUp("late@example.com");
    expect(late.householdId).not.toBe(host.householdId);
  });

  it("marks an invite spent, so it cannot seed a second account", async () => {
    const host = await signUp("host-once@example.com");
    await client.exec(`
      insert into household_invites (household_id, invited_by, email, token, expires_at)
      values ('${host.householdId}', '${host.id}', 'twice@example.com', 'tok-once', now() + interval '7 days')
    `);

    const first = await signUp("twice@example.com");
    expect(first.householdId).toBe(host.householdId);

    // `user.email` is unique, so the same address cannot sign up twice — but an
    // account can be deleted and remade, and the invite must not still be live.
    const spent = await client.query<{ accepted_at: string | null }>(
      `select accepted_at from household_invites where token = 'tok-once'`,
    );
    expect(spent.rows[0].accepted_at).not.toBeNull();

    // channels.owner_id -> profiles.id has no ON DELETE CASCADE, so the rows
    // have to come out in order. Worth knowing before building "delete my
    // account": a plain profile delete is blocked today.
    await client.exec(`delete from channels where owner_id = '${first.id}'`);
    await client.exec(`delete from profiles where id = '${first.id}'`);
    await client.exec(`delete from "user" where id = '${first.id}'`);
    const again = await signUp("twice@example.com");
    expect(again.householdId).not.toBe(host.householdId);
  });

  it("does not let an invite to someone else pull an unrelated signup in", async () => {
    const host = await signUp("host-other@example.com");
    await client.exec(`
      insert into household_invites (household_id, invited_by, email, token, expires_at)
      values ('${host.householdId}', '${host.id}', 'intended@example.com', 'tok-other', now() + interval '7 days')
    `);

    const bystander = await signUp("bystander@example.com");
    expect(bystander.householdId).not.toBe(host.householdId);
  });
});
