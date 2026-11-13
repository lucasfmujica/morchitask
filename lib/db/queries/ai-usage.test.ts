/**
 * The AI limit against a real Postgres: it has to hold across calls (it used
 * to be a per-instance `Map`), reset on a new day, and leave the rest of
 * `notification_prefs` alone, since that column also carries real settings.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const client = new PGlite();
const testDb = drizzle(client, { schema });
vi.mock("@/lib/db/client", () => ({ db: testDb, dbPool: testDb }));

const H = "11111111-0000-4000-8000-000000000001";
const U = "11111111-0000-4000-8000-000000000002";

let consumeAiQuota: typeof import("./ai-usage").consumeAiQuota;

beforeEach(async () => {
  await client.exec("drop schema public cascade; create schema public;");
  const dir = join(process.cwd(), "drizzle/migrations");
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const st of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) {
      if (st.trim()) await client.exec(st);
    }
  }
  consumeAiQuota ??= (await import("./ai-usage")).consumeAiQuota;
  await client.exec(`
    insert into households (id) values ('${H}');
    insert into "user" (id, email) values ('${U}', 'u@example.com');
    insert into profiles (id, household_id, display_name, notification_prefs)
      values ('${U}', '${H}', 'u', '{"dailyPlan": true}');
  `);
});

const prefs = async () =>
  (
    await client.query<{ p: Record<string, unknown> }>(
      `select notification_prefs as p from profiles where id = '${U}'`,
    )
  ).rows[0].p;

describe("consumeAiQuota", () => {
  it("allows up to the limit and refuses the next one", async () => {
    const day = "2026-11-13";
    expect(await consumeAiQuota(H, U, "plan", day, 2)).toBe(true);
    expect(await consumeAiQuota(H, U, "plan", day, 2)).toBe(true);
    expect(await consumeAiQuota(H, U, "plan", day, 2)).toBe(false);
  });

  it("counts each kind on its own", async () => {
    const day = "2026-11-13";
    expect(await consumeAiQuota(H, U, "plan", day, 1)).toBe(true);
    expect(await consumeAiQuota(H, U, "capture", day, 1)).toBe(true);
    expect(await consumeAiQuota(H, U, "plan", day, 1)).toBe(false);
  });

  it("starts over on a new day, and keeps the rest of the prefs", async () => {
    expect(await consumeAiQuota(H, U, "plan", "2026-11-13", 1)).toBe(true);
    expect(await consumeAiQuota(H, U, "plan", "2026-11-13", 1)).toBe(false);
    expect(await consumeAiQuota(H, U, "plan", "2026-11-14", 1)).toBe(true);
    expect(await prefs()).toEqual({ dailyPlan: true, ai_usage: { day: "2026-11-14", plan: 1 } });
  });
});
