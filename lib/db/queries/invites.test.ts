/**
 * The write side of invites, against a real Postgres.
 *
 * `household-provisioning.test.ts` covers what happens when an invite is
 * *claimed*. This covers making and revoking them — in particular that
 * re-inviting the same address replaces the live invite rather than stacking
 * another one behind it, since a hidden second invite would survive a revoke.
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

let invites: typeof import("./invites");

const HOUSEHOLD = "cccccccc-0000-4000-8000-000000000001";
const OTHER_HOUSEHOLD = "dddddddd-0000-4000-8000-000000000001";
const HOST = "cccccccc-0000-4000-8000-000000000002";
const OTHER_HOST = "dddddddd-0000-4000-8000-000000000002";

let tokenSeq = 0;
const nextToken = () => `token-${++tokenSeq}`;

beforeAll(async () => {
  const dir = join(process.cwd(), "drizzle/migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const stmt of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await client.exec(stmt);
    }
  }

  for (const [household, user] of [
    [HOUSEHOLD, HOST],
    [OTHER_HOUSEHOLD, OTHER_HOST],
  ]) {
    await client.exec(`
      insert into households (id) values ('${household}');
      insert into "user" (id, email) values ('${user}', '${user}@example.com');
      insert into profiles (id, household_id, display_name)
        values ('${user}', '${household}', 'host');
    `);
  }

  invites = await import("./invites");
});

describe("createInvite", () => {
  it("stores the address lowercased and trimmed, so the claim can match it", async () => {
    const row = await invites.createInvite(HOUSEHOLD, HOST, "  MiXeD@Example.COM  ", nextToken());
    expect(row.email).toBe("mixed@example.com");
  });

  it("sets an expiry a week out, not in the past", async () => {
    const row = await invites.createInvite(HOUSEHOLD, HOST, "ttl@example.com", nextToken());
    const days = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(invites.INVITE_TTL_DAYS - 1);
    expect(days).toBeLessThanOrEqual(invites.INVITE_TTL_DAYS);
  });

  it("replaces a live invite for the same address instead of stacking another", async () => {
    await invites.createInvite(HOUSEHOLD, HOST, "again@example.com", nextToken());
    await invites.createInvite(HOUSEHOLD, HOST, "again@example.com", nextToken());

    const live = (await invites.pendingInvites(HOUSEHOLD)).filter(
      (i) => i.email === "again@example.com",
    );
    // Two rows here would mean revoking the visible one leaves a way in.
    expect(live).toHaveLength(1);
  });

  it("leaves an already-claimed invite alone when re-inviting", async () => {
    await invites.createInvite(HOUSEHOLD, HOST, "claimed@example.com", "token-claimed");
    await client.exec(
      `update household_invites set accepted_at = now() where token = 'token-claimed'`,
    );
    await invites.createInvite(HOUSEHOLD, HOST, "claimed@example.com", nextToken());

    const rows = await client.query<{ n: number }>(
      `select count(*)::int as n from household_invites where email = 'claimed@example.com'`,
    );
    // The claimed one is history — deleting it would erase who joined how.
    expect(rows.rows[0].n).toBe(2);
  });
});

describe("pendingInvites", () => {
  it("hides expired invites", async () => {
    await invites.createInvite(HOUSEHOLD, HOST, "old@example.com", "token-old");
    await client.exec(
      `update household_invites set expires_at = now() - interval '1 day' where token = 'token-old'`,
    );
    const live = await invites.pendingInvites(HOUSEHOLD);
    expect(live.some((i) => i.email === "old@example.com")).toBe(false);
  });

  it("never shows another household's invites", async () => {
    await invites.createInvite(OTHER_HOUSEHOLD, OTHER_HOST, "theirs@example.com", nextToken());
    const mine = await invites.pendingInvites(HOUSEHOLD);
    expect(mine.some((i) => i.email === "theirs@example.com")).toBe(false);
  });
});

describe("revokeInvite", () => {
  it("removes the invite", async () => {
    const row = await invites.createInvite(HOUSEHOLD, HOST, "bye@example.com", nextToken());
    await invites.revokeInvite(HOUSEHOLD, row.id);
    const live = await invites.pendingInvites(HOUSEHOLD);
    expect(live.some((i) => i.email === "bye@example.com")).toBe(false);
  });

  it("cannot revoke another household's invite", async () => {
    const theirs = await invites.createInvite(
      OTHER_HOUSEHOLD,
      OTHER_HOST,
      "safe@example.com",
      nextToken(),
    );
    await invites.revokeInvite(HOUSEHOLD, theirs.id);

    const stillThere = await invites.pendingInvites(OTHER_HOUSEHOLD);
    expect(stillThere.some((i) => i.email === "safe@example.com")).toBe(true);
  });
});

describe("memberCount", () => {
  it("counts only this household's profiles", async () => {
    expect(await invites.memberCount(HOUSEHOLD)).toBe(1);
    expect(await invites.memberCount(OTHER_HOUSEHOLD)).toBe(1);
  });
});

describe("createInviteWithinCap", () => {
  const SPACE = "eeeeeeee-0000-4000-8000-0000000000e1";
  const OWNER = "eeeeeeee-0000-4000-8000-0000000000e2";

  beforeAll(async () => {
    await client.exec(`
      insert into households (id) values ('${SPACE}');
      insert into "user" (id, email) values ('${OWNER}', 'Owner@Example.com');
      insert into profiles (id, household_id, display_name) values ('${OWNER}', '${SPACE}', 'owner');
    `);
  });

  it("refuses your own address, in any case", async () => {
    expect(
      await invites.createInviteWithinCap(SPACE, OWNER, "  OWNER@example.COM ", nextToken()),
    ).toEqual({ ok: false, reason: "self" });
  });

  it("refuses someone already in the space", async () => {
    await client.exec(`
      insert into "user" (id, email) values ('eeeeeeee-0000-4000-8000-0000000000e3', 'member@example.com');
      insert into profiles (id, household_id, display_name)
        values ('eeeeeeee-0000-4000-8000-0000000000e3', '${SPACE}', 'member');
    `);
    expect(
      await invites.createInviteWithinCap(SPACE, OWNER, "member@example.com", nextToken()),
    ).toEqual({ ok: false, reason: "member" });
    await client.exec(`
      delete from profiles where id = 'eeeeeeee-0000-4000-8000-0000000000e3';
      delete from "user" where id = 'eeeeeeee-0000-4000-8000-0000000000e3';
    `);
  });

  it("lets two invites sent at once take one seat between them, not two", async () => {
    const results = await Promise.all([
      invites.createInviteWithinCap(SPACE, OWNER, "one@example.com", nextToken()),
      invites.createInviteWithinCap(SPACE, OWNER, "two@example.com", nextToken()),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "full" }]);
    expect(await invites.pendingInvites(SPACE)).toHaveLength(1);
  });

  it("re-inviting the same address replaces it rather than counting it twice", async () => {
    const [live] = await invites.pendingInvites(SPACE);
    const again = await invites.createInviteWithinCap(SPACE, OWNER, live.email, nextToken());
    expect(again.ok).toBe(true);
    expect(await invites.pendingInvites(SPACE)).toHaveLength(1);
  });

  it("a refused invite leaves the live one in place", async () => {
    const [live] = await invites.pendingInvites(SPACE);
    const other = live.email === "one@example.com" ? "two@example.com" : "one@example.com";
    expect(await invites.createInviteWithinCap(SPACE, OWNER, other, nextToken())).toEqual({
      ok: false,
      reason: "full",
    });
    expect((await invites.pendingInvites(SPACE)).map((i) => i.email)).toEqual([live.email]);
  });
});
