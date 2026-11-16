/**
 * Changing a person's timezone, against a real Postgres: plans keep their
 * wall-clock time, history and other people's things do not move.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const client = new PGlite();
const testDb = drizzle(client, { schema });
vi.mock("@/lib/db/client", () => ({ db: testDb, dbPool: testDb }));

const H = "a0000000-0000-4000-8000-000000000001";
const ME = "a0000000-0000-4000-8000-000000000002";
const PARTNER = "a0000000-0000-4000-8000-000000000003";
const OTHER_H = "b0000000-0000-4000-8000-000000000001";
const STRANGER = "b0000000-0000-4000-8000-000000000002";
const BA = "America/Argentina/Buenos_Aires";
const MADRID = "Europe/Madrid";

let tz: typeof import("./timezone");
let n = 0;
const uuid = () => `e0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

/** A task with a block tomorrow at `time` on `zone`'s clock. Returns its id. */
async function task(owner: string, household: string, time: string, zone: string, extra = "") {
  const id = uuid();
  await client.exec(`
    insert into tasks (id, household_id, owner_id, title, block_start, block_end ${extra ? ", " + extra.split("=")[0] : ""})
    values ('${id}', '${household}', '${owner}', 't',
      ((current_date + 1)::text || ' ${time}')::timestamp at time zone '${zone}',
      ((current_date + 1)::text || ' ${time}')::timestamp at time zone '${zone}' + interval '1 hour'
      ${extra ? ", " + extra.split("=")[1] : ""})`);
  return id;
}

/** The block's start as a clock time in `zone`. */
async function clock(id: string, zone: string, col = "block_start", table = "tasks") {
  const r = await client.query<{ t: string }>(
    `select to_char(${col} at time zone '${zone}', 'HH24:MI') as t from ${table} where id = '${id}'`,
  );
  return r.rows[0]?.t;
}

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
    insert into households (id) values ('${H}'), ('${OTHER_H}');
    insert into "user" (id, email) values ('${ME}', 'me@example.com'),
      ('${PARTNER}', 'p@example.com'), ('${STRANGER}', 's@example.com');
    insert into profiles (id, household_id, display_name) values
      ('${ME}', '${H}', 'me'), ('${PARTNER}', '${H}', 'partner'), ('${STRANGER}', '${OTHER_H}', 's');
  `);
  tz = await import("./timezone");
});

beforeEach(async () => {
  await client.exec(
    `delete from task_blocks; delete from tasks; update profiles set timezone = '${BA}'`,
  );
});

describe("changeTimeZone", () => {
  it("saves the zone on the caller's profile only", async () => {
    expect(await tz.changeTimeZone(H, ME, MADRID)).toMatchObject({ changed: true, from: BA });
    const rows = await client.query<{ id: string; timezone: string }>(
      `select id, timezone from profiles order by id`,
    );
    expect(Object.fromEntries(rows.rows.map((r) => [r.id, r.timezone]))).toEqual({
      [ME]: MADRID,
      [PARTNER]: BA,
      [STRANGER]: BA,
    });
  });

  it("is a no-op for the zone already saved, and for a profile outside the household", async () => {
    expect(await tz.changeTimeZone(H, ME, BA)).toMatchObject({ changed: false });
    expect(await tz.changeTimeZone(OTHER_H, ME, MADRID)).toMatchObject({
      changed: false,
      from: null,
    });
    expect(await clock(ME, BA, "now()", "profiles")).toBeDefined();
  });

  it("keeps an upcoming block at the same clock time in the new zone", async () => {
    const id = await task(ME, H, "10:00", BA);
    await tz.changeTimeZone(H, ME, MADRID);
    expect(await clock(id, MADRID)).toBe("10:00");
    expect(await clock(id, MADRID, "block_end")).toBe("11:00");
  });

  it("does not shift twice when the same change is sent again", async () => {
    const id = await task(ME, H, "10:00", BA);
    await tz.changeTimeZone(H, ME, MADRID);
    await tz.changeTimeZone(H, ME, MADRID);
    expect(await clock(id, MADRID)).toBe("10:00");
  });

  it("leaves the partner's and another household's blocks where they were", async () => {
    const theirs = await task(PARTNER, H, "10:00", BA);
    const far = await task(STRANGER, OTHER_H, "10:00", BA);
    await tz.changeTimeZone(H, ME, MADRID);
    expect(await clock(theirs, BA)).toBe("10:00");
    expect(await clock(far, BA)).toBe("10:00");
  });

  it("leaves what already happened, and what is done, where it was", async () => {
    const past = await task(ME, H, "10:00", BA);
    await client.exec(
      `update tasks set block_start = block_start - interval '3 days', block_end = block_end - interval '3 days' where id = '${past}'`,
    );
    const done = await task(ME, H, "10:00", BA);
    await client.exec(`update tasks set status = 'done' where id = '${done}'`);
    await tz.changeTimeZone(H, ME, MADRID);
    expect(await clock(past, BA)).toBe("10:00");
    expect(await clock(done, BA)).toBe("10:00");
  });

  it("moves a pending reminder with whoever set it", async () => {
    const mine = await task(ME, H, "10:00", BA);
    // On the partner's shared task, but set by me.
    const setByMe = await task(PARTNER, H, "10:00", BA);
    // On my shared task, but set by the partner.
    const setByPartner = await task(ME, H, "10:00", BA);
    await client.exec(`
      update tasks set remind_at = block_start - interval '15 minutes' where id in ('${mine}', '${setByMe}', '${setByPartner}');
      update tasks set shared = true, remind_by = '${ME}' where id = '${setByMe}';
      update tasks set shared = true, remind_by = '${PARTNER}' where id = '${setByPartner}';
    `);
    await tz.changeTimeZone(H, ME, MADRID);
    expect(await clock(mine, MADRID, "remind_at")).toBe("09:45");
    expect(await clock(setByMe, MADRID, "remind_at")).toBe("09:45");
    expect(await clock(setByPartner, BA, "remind_at")).toBe("09:45");
  });

  it("moves the task's blocks too, and names the ones with a calendar event", async () => {
    const id = await task(ME, H, "10:00", BA);
    const synced = uuid();
    const local = uuid();
    const partnerTask = await task(PARTNER, H, "10:00", BA);
    const partnerBlock = uuid();
    await client.exec(`
      insert into task_blocks (id, household_id, task_id, start_at, end_at, gcal_event_id)
        select '${synced}', '${H}', id, block_start, block_end, 'evt_1' from tasks where id = '${id}';
      insert into task_blocks (id, household_id, task_id, start_at, end_at)
        select '${local}', '${H}', id, block_start, block_end from tasks where id = '${id}';
      insert into task_blocks (id, household_id, task_id, start_at, end_at, gcal_event_id)
        select '${partnerBlock}', '${H}', id, block_start, block_end, 'evt_2' from tasks where id = '${partnerTask}';
    `);
    const res = await tz.changeTimeZone(H, ME, MADRID);
    expect(res.resync).toEqual([synced]);
    expect(await clock(synced, MADRID, "start_at", "task_blocks")).toBe("10:00");
    expect(await clock(local, MADRID, "start_at", "task_blocks")).toBe("10:00");
    expect(await clock(partnerBlock, BA, "start_at", "task_blocks")).toBe("10:00");
  });
});
