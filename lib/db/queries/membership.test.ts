/**
 * Moving a person between spaces rewrites `household_id`, the column every
 * isolation guarantee hangs on, so this runs the real moves against a real
 * Postgres (pglite) and checks both edges: everything private goes with the
 * person, everything shared stays, and afterwards neither side can read the
 * other's private rows through the ordinary queries.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle/migrations");
const client = new PGlite();
const testDb = drizzle(client, { schema });
vi.mock("@/lib/db/client", () => ({ db: testDb, dbPool: testDb }));
// Provisioning reads the request's language; there is no request here.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const CASA = "11111111-0000-4000-8000-000000000000";
const SOLO = "22222222-0000-4000-8000-000000000000";
const ANA = "aaaaaaaa-0000-4000-8000-000000000001";
const MARTIN = "bbbbbbbb-0000-4000-8000-000000000001";
const JO = "cccccccc-0000-4000-8000-000000000001";
const TODAY = "2026-11-13";
const TOKEN = "tok_join_0123456789abcdef";

let m: typeof import("./membership");
let tasksQ: typeof import("./tasks");
let subs: typeof import("./subscriptions");

const q = async <T = Record<string, unknown>>(sql: string) => (await client.query<T>(sql)).rows;
const one = async <T = Record<string, unknown>>(sql: string) => (await q<T>(sql))[0];
const count = async (sql: string) =>
  Number((await one<{ n: number }>(`select count(*)::int as n from ${sql}`)).n);
const householdOf = async (table: string, id: string) =>
  (await one<{ h: string }>(`select household_id::text as h from ${table} where id = '${id}'`))?.h;

/** Ids of the seeded rows, filled by `seed`. */
const ids: Record<string, string> = {};

async function insertTask(owner: string, title: string, extra = "") {
  const [row] = await q<{ id: string }>(
    `insert into tasks (household_id, owner_id, title ${extra ? "," + extra.split("|")[0] : ""})
     values ('${CASA}', '${owner}', '${title}' ${extra ? "," + extra.split("|")[1] : ""}) returning id`,
  );
  return row.id;
}

async function seed() {
  await client.exec(`
    insert into households (id, name, trial_ends_at) values
      ('${CASA}', 'Casa', '2026-11-22 12:00:00+00'),
      ('${SOLO}', 'Mi espacio', '2026-11-19 12:00:00+00');
    insert into "user" (id, email) values
      ('${ANA}', 'ana@example.com'), ('${MARTIN}', 'martin@example.com'), ('${JO}', 'jo@example.com');
    insert into profiles (id, household_id, display_name, created_at) values
      ('${ANA}', '${CASA}', 'Ana', '2026-10-02'),
      ('${MARTIN}', '${CASA}', 'Martín', '2026-09-01'),
      ('${JO}', '${SOLO}', 'Jo', '2026-11-05');
    -- Martín joined Casa on Ana's invite, though his account is older.
    insert into household_invites (household_id, invited_by, email, token, expires_at, accepted_at)
      values ('${CASA}', '${ANA}', 'martin@example.com', 'tok_martin_accepted_0000', now() + interval '1 day', '2026-10-04');
  `);

  const [cm] = await q<{ id: string }>(
    `insert into channels (household_id, owner_id, name, color) values ('${CASA}', '${MARTIN}', 'Trabajo M', '#000') returning id`,
  );
  const [ca] = await q<{ id: string }>(
    `insert into channels (household_id, owner_id, name, color) values ('${CASA}', '${ANA}', 'Trabajo A', '#000') returning id`,
  );
  const [om] = await q<{ id: string }>(
    `insert into objectives (household_id, owner_id, title, start_date, end_date) values ('${CASA}', '${MARTIN}', 'Meta M', '2026-11-09', '2026-11-15') returning id`,
  );
  const [tm] = await q<{ id: string }>(
    `insert into recurring_templates (household_id, owner_id, title, freq, channel_id) values ('${CASA}', '${MARTIN}', 'Rutina M', 'daily', '${ca.id}') returning id`,
  );
  Object.assign(ids, { cm: cm.id, ca: ca.id, om: om.id, tm: tm.id });

  ids.pm = await insertTask(
    MARTIN,
    "privada M",
    `planned_date, channel_id, objective_id, template_id, template_date|'${TODAY}', '${cm.id}', '${om.id}', '${tm.id}', '${TODAY}'`,
  );
  ids.sm = await insertTask(
    MARTIN,
    "compartida M",
    `shared, planned_date, channel_id, actual_time_min, gcal_event_id|true, '${TODAY}', '${cm.id}', 70, 'evt_m'`,
  );
  ids.sd = await insertTask(
    MARTIN,
    "compartida hecha",
    `shared, status, planned_date|true, 'done', '2026-11-12'`,
  );
  ids.pa = await insertTask(ANA, "privada A", `planned_date|'${TODAY}'`);
  ids.sa = await insertTask(ANA, "compartida A", `shared, channel_id|true, '${cm.id}'`);

  await client.exec(`
    insert into task_blocks (household_id, task_id, start_at, end_at) values
      ('${CASA}', '${ids.pm}', '${TODAY} 13:00+00', '${TODAY} 14:00+00'),
      ('${CASA}', '${ids.sm}', '${TODAY} 15:00+00', '${TODAY} 16:00+00');
    insert into subtasks (household_id, task_id, title, assignee_id) values
      ('${CASA}', '${ids.pm}', 'sub privada', '${ANA}'),
      ('${CASA}', '${ids.sm}', 'sub compartida', '${MARTIN}');
    insert into task_time_entries (household_id, task_id, user_id, day, minutes) values
      ('${CASA}', '${ids.pm}', '${MARTIN}', '${TODAY}', 25),
      ('${CASA}', '${ids.sm}', '${MARTIN}', '${TODAY}', 30),
      ('${CASA}', '${ids.sm}', '${ANA}', '${TODAY}', 20);
    insert into task_comments (household_id, task_id, author_id, body) values
      ('${CASA}', '${ids.pm}', '${MARTIN}', 'nota privada'),
      ('${CASA}', '${ids.sm}', '${MARTIN}', 'en lo compartido'),
      ('${CASA}', '${ids.sa}', '${ANA}', 'de Ana');
    insert into task_reactions (household_id, task_id, author_id, emoji) values
      ('${CASA}', '${ids.pm}', '${MARTIN}', '👍');
    insert into task_attachments (household_id, task_id, uploader_id, url, pathname, name, content_type, size_bytes) values
      ('${CASA}', '${ids.pm}', '${MARTIN}', 'https://blob.test/a', 'a', 'a.pdf', 'application/pdf', 10);
    insert into daily_notes (household_id, owner_id, note_date) values ('${CASA}', '${MARTIN}', '${TODAY}');
    insert into weekly_notes (household_id, owner_id, week_start) values ('${CASA}', '${MARTIN}', '2026-11-09');
    -- An open invite Martín sent on behalf of Casa: a door that closes with him.
    insert into household_invites (household_id, invited_by, email, token, expires_at)
      values ('${CASA}', '${MARTIN}', 'amigo@example.com', 'tok_martin_sent_000000', now() + interval '3 days');
  `);
}

beforeEach(async () => {
  await client.exec(
    "drop schema public cascade; create schema public; drop schema if exists app_private cascade;",
  );
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const st of readFileSync(join(MIGRATIONS_DIR, file), "utf8").split(
      "--> statement-breakpoint",
    )) {
      if (st.trim()) await client.exec(st);
    }
  }
  m ??= await import("./membership");
  tasksQ ??= await import("./tasks");
  subs ??= await import("./subscriptions");
  for (const k of Object.keys(ids)) delete ids[k];
  await seed();
});

describe("who runs a space", () => {
  it("is whoever nobody invited, until someone pays", async () => {
    const before = await m.spaceMembers(CASA);
    expect(before.roles).toEqual({ creatorId: ANA, managerId: null, adminId: ANA });

    await subs.recordBillingManager(CASA, MARTIN);
    const after = await m.spaceMembers(CASA);
    expect(after.roles).toEqual({ creatorId: ANA, managerId: MARTIN, adminId: MARTIN });
  });

  it("moves the payer marker instead of adding a second one", async () => {
    await subs.recordBillingManager(CASA, MARTIN);
    await subs.recordBillingManager(CASA, ANA);
    expect((await subs.billingManager(CASA))?.id).toBe(ANA);
    expect(await count(`profiles where notification_prefs ? 'billing_manager_for'`)).toBe(1);
  });
});

describe("leaving a shared space", () => {
  it("counts what the sheet promises", async () => {
    expect(await m.moveCounts(CASA, MARTIN)).toEqual({
      privateTasks: 1,
      sharedTasks: 2,
      sharedDated: 1,
      comments: 1,
    });
  });

  it("takes the private things along and leaves the shared ones with the other person", async () => {
    const res = await m.separateMember(CASA, MARTIN, MARTIN);
    expect(res.ok).toBe(true);
    const NEW = (res as { householdId: string }).householdId;
    expect(NEW).not.toBe(CASA);

    // The person and everything of theirs.
    expect(await householdOf("profiles", MARTIN)).toBe(NEW);
    for (const id of [ids.pm, ids.cm, ids.om, ids.tm]) {
      const table =
        id === ids.pm
          ? "tasks"
          : id === ids.cm
            ? "channels"
            : id === ids.om
              ? "objectives"
              : "recurring_templates";
      expect(await householdOf(table, id)).toBe(NEW);
    }
    for (const child of [
      "task_blocks",
      "subtasks",
      "task_time_entries",
      "task_comments",
      "task_reactions",
      "task_attachments",
    ]) {
      expect(await count(`${child} where task_id = '${ids.pm}' and household_id <> '${NEW}'`)).toBe(
        0,
      );
    }
    expect(
      await count(`daily_notes where owner_id = '${MARTIN}' and household_id = '${NEW}'`),
    ).toBe(1);
    expect(
      await count(`weekly_notes where owner_id = '${MARTIN}' and household_id = '${NEW}'`),
    ).toBe(1);
    // A subtask on his private task assigned to Ana no longer names her.
    expect(await count(`subtasks where task_id = '${ids.pm}' and assignee_id is not null`)).toBe(0);
    // His routine filed into Ana's category: the routine goes, the category stays.
    expect(
      (
        await one<{ c: string | null }>(
          `select channel_id as c from recurring_templates where id = '${ids.tm}'`,
        )
      ).c,
    ).toBeNull();
    // His private task keeps his own category, goal and routine.
    const pm = await one<{ channel_id: string; objective_id: string; template_id: string }>(
      `select channel_id, objective_id, template_id from tasks where id = '${ids.pm}'`,
    );
    expect(pm).toEqual({ channel_id: ids.cm, objective_id: ids.om, template_id: ids.tm });

    // The shared task he owned stays in Casa, as Ana's, in her backlog.
    const sm = await one<{
      household_id: string;
      owner_id: string;
      planned_date: string | null;
      block_start: string | null;
      channel_id: string | null;
      gcal_event_id: string | null;
      actual_time_min: string;
    }>(`select * from tasks where id = '${ids.sm}'`);
    expect(sm.household_id).toBe(CASA);
    expect(sm.owner_id).toBe(ANA);
    expect(sm.planned_date).toBeNull();
    expect(sm.block_start).toBeNull();
    expect(await count(`task_blocks where task_id = '${ids.sm}'`)).toBe(0);
    expect(sm.channel_id).toBeNull();
    expect(sm.gcal_event_id).toBeNull();
    // 30 of his and 20 of hers stay as entries; his undated 20 go.
    expect(Number(sm.actual_time_min)).toBe(50);
    // His minutes and comment on it stay with it, in Casa.
    expect(
      await count(
        `task_time_entries where task_id = '${ids.sm}' and user_id = '${MARTIN}' and household_id = '${CASA}'`,
      ),
    ).toBe(1);
    expect(
      await count(
        `task_comments where task_id = '${ids.sm}' and author_id = '${MARTIN}' and household_id = '${CASA}'`,
      ),
    ).toBe(1);
    expect(await count(`subtasks where task_id = '${ids.sm}' and assignee_id is not null`)).toBe(0);
    // A finished shared task keeps its day: it is history, not a plan.
    expect(
      (await one<{ d: string }>(`select planned_date::text as d from tasks where id = '${ids.sd}'`))
        .d,
    ).toBe("2026-11-12");
    // Ana's own task that pointed at his category loses the reference.
    expect(
      (await one<{ c: string | null }>(`select channel_id as c from tasks where id = '${ids.sa}'`))
        .c,
    ).toBeNull();
    // The invite he sent for Casa is gone; the one he accepted stays as history.
    expect(await count(`household_invites where invited_by = '${MARTIN}'`)).toBe(0);
    expect(await count(`household_invites where token = 'tok_martin_accepted_0000'`)).toBe(1);
  });

  it("does not start a new trial: the new space keeps the old one's end", async () => {
    const res = await m.separateMember(CASA, MARTIN, MARTIN);
    const NEW = (res as { householdId: string }).householdId;
    const h = await one<{ t: string; p: string | null }>(
      `select trial_ends_at::text as t, plan_override as p from households where id = '${NEW}'`,
    );
    const old = await one<{ t: string }>(
      `select trial_ends_at::text as t from households where id = '${CASA}'`,
    );
    expect(h.t).toBe(old.t);
    expect(h.p).toBeNull();
    // No subscription follows them: it pays for the space they left.
    expect(await count(`subscriptions where household_id = '${NEW}'`)).toBe(0);
  });

  it("keeps a comped person comped", async () => {
    await client.exec(`update households set plan_override = 'comp' where id = '${CASA}'`);
    const res = await m.separateMember(CASA, MARTIN, MARTIN);
    const NEW = (res as { householdId: string }).householdId;
    expect(
      (await one<{ p: string }>(`select plan_override as p from households where id = '${NEW}'`)).p,
    ).toBe("comp");
  });

  it("keeps each side out of the other's private rows afterwards", async () => {
    const res = await m.separateMember(CASA, MARTIN, MARTIN);
    const NEW = (res as { householdId: string }).householdId;

    const anaDay = (await tasksQ.tasksForDate(CASA, ANA, TODAY)).map((t) => t.title);
    expect(anaDay).not.toContain("privada M");
    expect(await tasksQ.tasksForDate(NEW, ANA, TODAY)).toHaveLength(0);

    const martinDay = (await tasksQ.tasksForDate(NEW, MARTIN, TODAY)).map((t) => t.title);
    expect(martinDay).toEqual(["privada M"]);
    // The shared tasks stayed behind; from his new space he cannot reach them.
    expect((await tasksQ.searchTasks(NEW, MARTIN, "compartida")).length).toBe(0);
    await expect(tasksQ.toggleTaskDone(NEW, MARTIN, ids.sm, true)).rejects.toThrow(
      "task not found",
    );
    expect((await tasksQ.backlogTasks(CASA, ANA)).map((t) => t.title)).toContain("compartida M");
  });

  it("refuses the person who runs the space, and a removal by the one who does not", async () => {
    expect(await m.separateMember(CASA, ANA, ANA)).toEqual({
      ok: false,
      reason: "admin_cannot_leave",
    });
    expect(await m.separateMember(CASA, MARTIN, ANA)).toEqual({ ok: false, reason: "not_admin" });
    expect(await count(`profiles where household_id = '${CASA}'`)).toBe(2);
  });

  it("lets the payer run the space even when they did not create it", async () => {
    await subs.recordBillingManager(CASA, MARTIN);
    expect(await m.separateMember(CASA, MARTIN, MARTIN)).toEqual({
      ok: false,
      reason: "admin_cannot_leave",
    });
    expect(await m.separateMember(CASA, ANA, MARTIN)).toEqual({ ok: false, reason: "not_admin" });
    const res = await m.separateMember(CASA, MARTIN, ANA);
    expect(res.ok).toBe(true);
    expect(await householdOf("profiles", ANA)).not.toBe(CASA);
    // Ana's private task went with her; her shared one stays, now Martín's.
    expect(await householdOf("tasks", ids.pa)).not.toBe(CASA);
    expect(
      (await one<{ o: string }>(`select owner_id as o from tasks where id = '${ids.sa}'`)).o,
    ).toBe(MARTIN);
  });

  it("removing is the same move, started by the person who runs the space", async () => {
    const res = await m.separateMember(CASA, ANA, MARTIN);
    expect(res.ok).toBe(true);
    expect(await householdOf("tasks", ids.pm)).not.toBe(CASA);
    expect(await m.separateMember(CASA, ANA, MARTIN)).toEqual({ ok: false, reason: "not_member" });
  });
});

describe("joining with an account that has a space of its own", () => {
  beforeEach(async () => {
    // Casa has room for one: Martín leaves first.
    await m.separateMember(CASA, ANA, MARTIN);
    await client.exec(`
      insert into household_invites (household_id, invited_by, email, token, expires_at)
        values ('${CASA}', '${ANA}', 'jo@example.com', '${TOKEN}', now() + interval '7 days');
      insert into channels (household_id, owner_id, name, color) values ('${SOLO}', '${JO}', 'Jo cat', '#000');
      insert into tasks (household_id, owner_id, title, planned_date) values ('${SOLO}', '${JO}', 'jo privada', '${TODAY}');
      insert into tasks (household_id, owner_id, title, planned_date, shared) values ('${SOLO}', '${JO}', 'jo compartida', '${TODAY}', true);
    `);
  });

  it("moves the person in with everything of theirs, private, and deletes the old space", async () => {
    expect(await m.joinHousehold(TOKEN, JO, "Jo@Example.com")).toEqual({
      ok: true,
      householdId: CASA,
    });
    expect(await householdOf("profiles", JO)).toBe(CASA);
    expect(
      await count(`tasks where owner_id = '${JO}' and household_id = '${CASA}' and not shared`),
    ).toBe(2);
    expect(await count(`channels where owner_id = '${JO}' and household_id = '${CASA}'`)).toBe(1);
    expect(await count(`households where id = '${SOLO}'`)).toBe(0);
    expect(
      await count(`household_invites where token = '${TOKEN}' and accepted_at is not null`),
    ).toBe(1);

    // Ana sees none of it, not even what was shared in Jo's old space.
    const anaDay = (await tasksQ.tasksForDate(CASA, ANA, TODAY)).map((t) => t.title);
    expect(anaDay.some((t) => t.startsWith("jo "))).toBe(false);
    expect((await tasksQ.tasksForDate(CASA, JO, TODAY)).length).toBe(2);
    // Joining took the seat: Jo is now admin of nothing, Ana still runs Casa.
    expect((await m.spaceMembers(CASA)).roles.adminId).toBe(ANA);
  });

  // Regression guard for "the address is the credential": a forwarded link
  // must not seat whoever opens it.
  it("refuses an account whose email is not the invited one, and changes nothing", async () => {
    expect(await m.joinHousehold(TOKEN, JO, "someone@else.com")).toEqual({
      ok: false,
      reason: "wrong_account",
    });
    expect(await householdOf("profiles", JO)).toBe(SOLO);
    expect(await count(`household_invites where token = '${TOKEN}' and accepted_at is null`)).toBe(
      1,
    );
  });

  it("blocks a renewing subscription of their own, and allows one set to end", async () => {
    await client.exec(`
      insert into subscriptions (household_id, provider_subscription_id, provider_customer_id, status, cancel_at_period_end)
        values ('${SOLO}', 'sub_jo', 'cus_jo', 'active', false);
    `);
    expect(await m.joinHousehold(TOKEN, JO, "jo@example.com")).toEqual({
      ok: false,
      reason: "own_plan",
    });
    await client.exec(
      `update subscriptions set cancel_at_period_end = true where household_id = '${SOLO}'`,
    );
    expect((await m.joinHousehold(TOKEN, JO, "jo@example.com")).ok).toBe(true);
    expect(await count(`subscriptions where household_id = '${SOLO}'`)).toBe(0);
  });

  it("counts the seat again under the lock", async () => {
    await client.exec(`
      insert into "user" (id, email) values ('dddddddd-0000-4000-8000-000000000001', 'x@example.com');
      insert into profiles (id, household_id, display_name) values ('dddddddd-0000-4000-8000-000000000001', '${CASA}', 'X');
    `);
    expect(await m.joinHousehold(TOKEN, JO, "jo@example.com")).toEqual({
      ok: false,
      reason: "full",
    });
  });

  it("refuses someone who already shares their space, and a link that was used", async () => {
    await client.exec(`update profiles set household_id = '${SOLO}' where id = '${MARTIN}'`);
    expect(await m.joinHousehold(TOKEN, JO, "jo@example.com")).toEqual({
      ok: false,
      reason: "not_alone",
    });
    await client.exec(`update household_invites set accepted_at = now() where token = '${TOKEN}'`);
    expect(await m.joinHousehold(TOKEN, JO, "jo@example.com")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("shows the invite to the link's holder, and says who is already in", async () => {
    expect((await m.invitePreview(TOKEN))?.inviterName).toBe("Ana");
    await m.joinHousehold(TOKEN, JO, "jo@example.com");
    expect(await m.invitePreview(TOKEN)).toBeNull();
    expect(await m.inviteHouseholdByToken(TOKEN)).toBe(CASA);
  });
});

describe("joinRefusal", () => {
  const base = {
    inviteEmail: "jo@example.com",
    userEmail: "jo@example.com",
    fromHousehold: "a",
    toHousehold: "b",
    fromMembers: 1,
    toMembers: 1,
    ownSubscription: null,
  };
  it.each([
    [{}, null],
    [{ userEmail: " JO@example.com " }, null],
    [{ userEmail: null }, "wrong_account"],
    [{ toHousehold: "a" }, "already_member"],
    [{ fromMembers: 2 }, "not_alone"],
    [{ ownSubscription: { status: "past_due", cancel_at_period_end: false } }, "own_plan"],
    [{ ownSubscription: { status: "canceled", cancel_at_period_end: false } }, null],
    [{ toMembers: 2 }, "full"],
  ])("%j → %s", (over, expected) => {
    expect(m.joinRefusal({ ...base, ...over })).toBe(expected);
  });
});
