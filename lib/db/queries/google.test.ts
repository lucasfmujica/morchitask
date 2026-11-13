/**
 * Sign-in and Calendar are separate Google grants, and the people already
 * using the app connected Calendar under the old single grant. Every later
 * login runs through `applyGoogleGrant`; if it ever writes an identity-only
 * token over theirs, their calendar stops working without anything saying so.
 * This runs the real writes against a real Postgres (pglite) to pin that down.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { CALENDAR_SCOPES } from "@/lib/google-grant";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle/migrations");

const client = new PGlite();
const testDb = drizzle(client, { schema });

vi.mock("@/lib/db/client", () => ({ db: testDb, dbPool: testDb }));

const HOUSEHOLD = "11111111-0000-4000-8000-000000000000";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000001";

const BASIC = "openid https://www.googleapis.com/auth/userinfo.email";
const CALENDAR = `${BASIC} ${CALENDAR_SCOPES.join(" ")}`;

let google: typeof import("./google");

async function state(userId: string) {
  const { rows } = await client.query<{
    refresh_token: string | null;
    access_token: string | null;
    scope: string | null;
    connected: boolean;
  }>(
    `select a.refresh_token, a.access_token, a.scope, p.google_calendar_connected as connected
       from account a join profiles p on p.id = a."userId" where a."userId" = $1`,
    [userId],
  );
  return rows[0];
}

beforeEach(async () => {
  await client.exec("drop schema public cascade; create schema public;");
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const statement of readFileSync(join(MIGRATIONS_DIR, file), "utf8").split(
      "--> statement-breakpoint",
    )) {
      if (statement.trim()) await client.exec(statement);
    }
  }
  google ??= await import("./google");

  // A connected under the old all-in-one grant; B, in the same household,
  // signed up after the split and never connected.
  await client.exec(`
    insert into households (id) values ('${HOUSEHOLD}');
    insert into "user" (id, email) values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');
    insert into profiles (id, household_id, display_name, google_calendar_connected) values
      ('${A}', '${HOUSEHOLD}', 'A', true), ('${B}', '${HOUSEHOLD}', 'B', false);
    insert into account ("userId", type, provider, "providerAccountId", refresh_token, access_token, scope) values
      ('${A}', 'oidc', 'google', 'ga', 'a-calendar-rt', 'a-at', '${CALENDAR}'),
      ('${B}', 'oidc', 'google', 'gb', null, 'b-at', '${BASIC}');
  `);
});

describe("applyGoogleGrant", () => {
  it("a connected user's plain re-login leaves their Calendar grant alone", async () => {
    const before = await state(A);
    await google.applyGoogleGrant(A, { provider: "google", access_token: "new", scope: BASIC });
    // Even with a refresh token in hand: it is an identity-only one.
    await google.applyGoogleGrant(A, {
      provider: "google",
      refresh_token: "identity-rt",
      access_token: "new",
      scope: BASIC,
    });
    expect(await state(A)).toEqual(before);
    expect(before).toMatchObject({ refresh_token: "a-calendar-rt", connected: true });
  });

  it("a new user's plain login does not mark them connected", async () => {
    await google.applyGoogleGrant(B, { provider: "google", access_token: "b2", scope: BASIC });
    expect(await state(B)).toMatchObject({ refresh_token: null, connected: false });
  });

  it("connecting stores the grant and the flag, for that person only", async () => {
    await google.applyGoogleGrant(B, {
      provider: "google",
      refresh_token: "b-calendar-rt",
      access_token: "b-cal-at",
      expires_at: 1_800_000_000,
      scope: CALENDAR,
    });
    expect(await state(B)).toEqual({
      refresh_token: "b-calendar-rt",
      access_token: "b-cal-at",
      scope: CALENDAR,
      connected: true,
    });
    // Same household, different person: untouched.
    expect(await state(A)).toMatchObject({ refresh_token: "a-calendar-rt", access_token: "a-at" });
  });

  it("a connect with the Calendar boxes unticked changes nothing", async () => {
    await google.applyGoogleGrant(B, {
      provider: "google",
      refresh_token: "b-identity-rt",
      scope: `${BASIC} ${CALENDAR_SCOPES[0]}`,
    });
    expect(await state(B)).toMatchObject({ refresh_token: null, connected: false });
  });

  it("disconnect still clears everything, and a plain login does not bring it back", async () => {
    await google.disconnectGoogleCalendar(A);
    expect(await state(A)).toEqual({
      refresh_token: null,
      access_token: null,
      scope: null,
      connected: false,
    });
    await google.applyGoogleGrant(A, { provider: "google", access_token: "x", scope: BASIC });
    expect(await state(A)).toMatchObject({ refresh_token: null, connected: false });

    await google.applyGoogleGrant(A, {
      provider: "google",
      refresh_token: "again",
      scope: CALENDAR,
    });
    expect(await state(A)).toMatchObject({ refresh_token: "again", connected: true });
    expect(await google.getGoogleRefreshToken(A)).toBe("again");
  });
});
