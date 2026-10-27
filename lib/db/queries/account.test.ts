/**
 * The delete has to be complete, and it has to stop where the other person
 * starts.
 *
 * Both are invisible in types and in review: a forgotten table leaves rows
 * behind after an account is "erased", and one `where` too wide takes the other
 * member's tasks with it. Neither shows up until it has already happened to
 * someone, so this runs the real functions against a real Postgres (pglite)
 * holding a shared household, and checks both edges.
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

const HOUSEHOLD = "11111111-0000-4000-8000-000000000000";
const SOLO_HOUSEHOLD = "22222222-0000-4000-8000-000000000000";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000001";
const SOLO = "cccccccc-0000-4000-8000-000000000001";

let account: typeof import("./account");

const count = async (sql: string) =>
  Number((await client.query<{ n: number }>(`select count(*)::int as n from ${sql}`)).rows[0].n);

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

  account ??= await import("./account");

  // One shared household with two people, plus a household of one — the two
  // cases that behave differently when the last member walks out.
  await client.exec(`
    insert into households (id) values ('${HOUSEHOLD}'), ('${SOLO_HOUSEHOLD}');
    insert into "user" (id, email) values
      ('${A}', 'a@example.com'), ('${B}', 'b@example.com'), ('${SOLO}', 'c@example.com');
    insert into profiles (id, household_id, display_name) values
      ('${A}', '${HOUSEHOLD}', 'A'), ('${B}', '${HOUSEHOLD}', 'B'),
      ('${SOLO}', '${SOLO_HOUSEHOLD}', 'Solo');

    insert into channels (id, household_id, owner_id, name) values
      ('${A}', '${HOUSEHOLD}', '${A}', 'A work'),
      ('${B}', '${HOUSEHOLD}', '${B}', 'B work');
    insert into objectives (id, household_id, owner_id, title, start_date, end_date) values
      ('${A}', '${HOUSEHOLD}', '${A}', 'A goal', '2026-08-01', '2026-08-31');
    insert into daily_notes (household_id, owner_id, note_date, intention) values
      ('${HOUSEHOLD}', '${A}', '2026-08-25', 'A intention');
    insert into recurring_templates (id, household_id, owner_id, title) values
      ('${A}', '${HOUSEHOLD}', '${A}', 'A routine');

    insert into tasks (id, household_id, owner_id, created_by, channel_id, objective_id, title)
      values ('${A}', '${HOUSEHOLD}', '${A}', '${A}', '${A}', '${A}', 'A task');
    -- B's task, but created by A and pointing at A's channel: the references
    -- that have to survive A leaving.
    insert into tasks (id, household_id, owner_id, created_by, channel_id, title)
      values ('${B}', '${HOUSEHOLD}', '${B}', '${A}', '${A}', 'B task');

    insert into subtasks (household_id, task_id, assignee_id, title) values
      ('${HOUSEHOLD}', '${B}', '${A}', 'assigned to A on B''s task');
    insert into task_comments (household_id, task_id, author_id, body) values
      ('${HOUSEHOLD}', '${B}', '${A}', 'A on B''s task'),
      ('${HOUSEHOLD}', '${A}', '${B}', 'B on A''s task');
    insert into task_reactions (household_id, task_id, author_id, emoji) values
      ('${HOUSEHOLD}', '${B}', '${A}', '👍');
    insert into task_attachments
      (household_id, task_id, uploader_id, url, pathname, name, content_type, size_bytes) values
      ('${HOUSEHOLD}', '${B}', '${A}', 'https://blob/x', 'x', 'x.pdf', 'application/pdf', 1);
    insert into task_time_entries (household_id, task_id, user_id, day, minutes) values
      ('${HOUSEHOLD}', '${B}', '${A}', '2026-08-25', 30),
      ('${HOUSEHOLD}', '${B}', '${B}', '2026-08-25', 10);
  `);
});

describe("exportAccount", () => {
  it("carries every kind of thing the person made", async () => {
    const out = await account.exportAccount(HOUSEHOLD, A);

    expect(out.profile?.id).toBe(A);
    expect(out.tasks.map((t) => t.title)).toEqual(["A task"]);
    expect(out.channels.map((c) => c.name)).toEqual(["A work"]);
    expect(out.objectives).toHaveLength(1);
    expect(out.routines).toHaveLength(1);
    expect(out.daily_notes).toHaveLength(1);
    // Tracked on someone else's task, but tracked by this person.
    expect(out.task_time_entries).toHaveLength(1);
  });

  it("does not hand out the other member's tasks", async () => {
    const out = await account.exportAccount(HOUSEHOLD, A);
    expect(out.tasks.map((t) => t.title)).not.toContain("B task");
    // Nor their name and photo, which the household row would carry.
    expect(out.household).toEqual({ name: "Mi hogar", timezone: expect.any(String) });
  });
});

describe("deleteAccount", () => {
  it("leaves nothing of the person behind", async () => {
    await account.deleteAccount(HOUSEHOLD, A);

    expect(await count(`"user" where id = '${A}'`)).toBe(0);
    expect(await count(`profiles where id = '${A}'`)).toBe(0);
    expect(await count(`tasks where owner_id = '${A}'`)).toBe(0);
    expect(await count(`channels where owner_id = '${A}'`)).toBe(0);
    expect(await count(`objectives where owner_id = '${A}'`)).toBe(0);
    expect(await count(`daily_notes where owner_id = '${A}'`)).toBe(0);
    expect(await count(`recurring_templates where owner_id = '${A}'`)).toBe(0);
    expect(await count(`task_comments where author_id = '${A}'`)).toBe(0);
    expect(await count(`task_reactions where author_id = '${A}'`)).toBe(0);
    expect(await count(`task_attachments where uploader_id = '${A}'`)).toBe(0);
    expect(await count(`task_time_entries where user_id = '${A}'`)).toBe(0);
  });

  it("returns the files to clean up, since nothing will point at them again", async () => {
    const { blobUrls } = await account.deleteAccount(HOUSEHOLD, A);
    expect(blobUrls).toEqual(["https://blob/x"]);
  });

  it("does not take the other member's work with it", async () => {
    await account.deleteAccount(HOUSEHOLD, A);

    expect(await count(`tasks where owner_id = '${B}'`)).toBe(1);
    expect(await count(`channels where owner_id = '${B}'`)).toBe(1);
    expect(await count(`task_time_entries where user_id = '${B}'`)).toBe(1);
    // B's comment lived on A's task, so it goes with the task — B's own task
    // keeps everything of B's.
    expect(await count(`subtasks where task_id = '${B}'`)).toBe(1);
  });

  it("blanks the references on rows that survive instead of deleting them", async () => {
    await account.deleteAccount(HOUSEHOLD, A);

    const [row] = (
      await client.query<{ created_by: string | null; channel_id: string | null }>(
        `select created_by, channel_id from tasks where id = '${B}'`,
      )
    ).rows;
    expect(row.created_by).toBeNull();
    expect(row.channel_id).toBeNull();

    const [sub] = (
      await client.query<{ assignee_id: string | null }>(
        `select assignee_id from subtasks where task_id = '${B}'`,
      )
    ).rows;
    expect(sub.assignee_id).toBeNull();
  });

  it("keeps the space alive while someone is still in it", async () => {
    await account.deleteAccount(HOUSEHOLD, A);
    expect(await count(`households where id = '${HOUSEHOLD}'`)).toBe(1);
  });

  it("takes the space with the last person out", async () => {
    await account.deleteAccount(HOUSEHOLD, A);
    await account.deleteAccount(HOUSEHOLD, B);
    expect(await count(`households where id = '${HOUSEHOLD}'`)).toBe(0);
  });

  it("takes the space when the only member leaves", async () => {
    await account.deleteAccount(SOLO_HOUSEHOLD, SOLO);
    expect(await count(`households where id = '${SOLO_HOUSEHOLD}'`)).toBe(0);
    // And leaves the household next door untouched.
    expect(await count(`households where id = '${HOUSEHOLD}'`)).toBe(1);
  });
});
