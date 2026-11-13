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

// The sign-up's browser language. Null by default, which is what the code
// already sees outside a request: no header, so the default locale.
let acceptLanguage: string | null = null;
vi.mock("next/headers", () => ({
  headers: async () => new Headers(acceptLanguage ? { "accept-language": acceptLanguage } : {}),
}));

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

  it("names the default categories in the language the account signs up in", async () => {
    const names = async (ownerId: string) =>
      (
        await client.query<{ name: string }>(
          "select name from channels where owner_id = $1 order by sort_order",
          [ownerId],
        )
      ).rows.map((r) => r.name);

    acceptLanguage = "en-US,en;q=0.9";
    const english = await signUp("cats-en@example.com");
    acceptLanguage = "es-AR,es;q=0.9";
    const spanish = await signUp("cats-es@example.com");
    acceptLanguage = null;

    // Every account used to get the Spanish names, whatever its language.
    expect(await names(english.id)).toEqual(["Work", "Home", "Personal"]);
    expect(await names(spanish.id)).toEqual(["Trabajo", "Hogar", "Personal"]);
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

  it("names a new space in the sign-up language", async () => {
    const nameOf = async (householdId: string) =>
      (
        await client.query<{ name: string }>("select name from households where id = $1", [
          householdId,
        ])
      ).rows[0].name;
    acceptLanguage = "en-US,en;q=0.9";
    const english = await signUp("space-en@example.com");
    acceptLanguage = null;
    const spanish = await signUp("space-es@example.com");
    expect(await nameOf(english.householdId)).toBe("My space");
    expect(await nameOf(spanish.householdId)).toBe("Mi espacio");
  });

  it("does not rename the space someone joins", async () => {
    const host = await signUp("host-name@example.com");
    await client.exec(`update households set name = 'Casa' where id = '${host.householdId}'`);
    await client.exec(`
      insert into household_invites (household_id, invited_by, email, token, expires_at)
      values ('${host.householdId}', '${host.id}', 'joiner-name@example.com', 'tok-name', now() + interval '7 days')
    `);
    acceptLanguage = "en-US";
    const guest = await signUp("joiner-name@example.com");
    acceptLanguage = null;
    expect(guest.householdId).toBe(host.householdId);
    const res = await client.query<{ name: string }>("select name from households where id = $1", [
      host.householdId,
    ]);
    expect(res.rows[0].name).toBe("Casa");
  });

  it("claims only the newest invite, leaving invites to other spaces untouched", async () => {
    const older = await signUp("host-older@example.com");
    const newer = await signUp("host-newer@example.com");
    await client.exec(`
      insert into household_invites (household_id, invited_by, email, token, expires_at, created_at) values
        ('${older.householdId}', '${older.id}', 'wanted@example.com', 'tok-older', now() + interval '7 days', now() - interval '1 day'),
        ('${newer.householdId}', '${newer.id}', 'wanted@example.com', 'tok-newer', now() + interval '7 days', now())
    `);

    const guest = await signUp("wanted@example.com");
    expect(guest.householdId).toBe(newer.householdId);
    const rows = await client.query<{ token: string; used: boolean }>(
      `select token, accepted_at is not null as used from household_invites
        where email = 'wanted@example.com' order by token`,
    );
    // Claiming every invite for the address used to mark the other space's as
    // used too, for a space this person never joined.
    expect(rows.rows).toEqual([
      { token: "tok-newer", used: true },
      { token: "tok-older", used: false },
    ]);
  });

  it("re-checks the member cap at claim time and never seats a third person", async () => {
    const host = await signUp("host-full@example.com");
    // Sent while there was room…
    await client.exec(`
      insert into household_invites (household_id, invited_by, email, token, expires_at) values
        ('${host.householdId}', '${host.id}', 'second-in@example.com', 'tok-full-1', now() + interval '7 days'),
        ('${host.householdId}', '${host.id}', 'third-in@example.com', 'tok-full-2', now() + interval '7 days')
    `);
    const second = await signUp("second-in@example.com");
    expect(second.householdId).toBe(host.householdId);

    // …claimed once the space is full: a space of its own instead.
    const third = await signUp("third-in@example.com");
    expect(third.householdId).not.toBe(host.householdId);
    const members = await client.query<{ n: number }>(
      "select count(*)::int as n from profiles where household_id = $1",
      [host.householdId],
    );
    expect(members.rows[0].n).toBe(2);
    const spent = await client.query<{ used: boolean }>(
      `select accepted_at is not null as used from household_invites where token = 'tok-full-2'`,
    );
    expect(spent.rows[0].used).toBe(false);
  });
});
