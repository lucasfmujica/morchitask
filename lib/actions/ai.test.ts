/**
 * The AI actions sit behind the same access gate as every write, and count
 * against a limit that lives in the database.
 *
 * Both were missing: a household whose trial had ended could keep calling
 * Claude (the proxy only gates page paths, and these are server actions), and
 * the daily limit was a per-instance `Map` that reset on every cold start.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAccess, type Access } from "@/lib/billing";

let session: { householdId: string; user: { id: string }; access?: Access } | null;
let billingEnabled = true;
const consumeAiQuota = vi.fn();
const breakdownTask = vi.fn();

vi.mock("next-intl/server", () => ({ getLocale: async () => "es" }));
vi.mock("@/lib/auth", () => ({ auth: async () => session }));
vi.mock("@/lib/billing-config", () => ({ isBillingEnabled: () => billingEnabled }));
vi.mock("@/lib/db/queries/ai-usage", () => ({ consumeAiQuota }));
vi.mock("@/lib/ai", () => ({
  AiError: class extends Error {},
  breakdownTask,
  parseCapture: vi.fn(),
  planDay: vi.fn(),
}));

const { suggestChecklist } = await import("./ai");

const NOW = new Date();
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const accessFor = (facts: Partial<Parameters<typeof resolveAccess>[0]>) =>
  resolveAccess({ planOverride: null, trialEndsAt: null, subscription: null, ...facts }, NOW);

const ask = () => suggestChecklist({ title: "Ordenar el placard" });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test";
  billingEnabled = true;
  consumeAiQuota.mockResolvedValue(true);
  breakdownTask.mockResolvedValue(["uno"]);
});

describe("AI access", () => {
  it("refuses a household whose trial ran out, without spending a use", async () => {
    session = {
      householdId: "h1",
      user: { id: "u1" },
      access: accessFor({ trialEndsAt: daysFromNow(-1) }),
    };
    await expect(ask()).resolves.toEqual({ ok: false, error: "locked" });
    expect(breakdownTask).not.toHaveBeenCalled();
    expect(consumeAiQuota).not.toHaveBeenCalled();
  });

  it.each([
    ["comped, even with no trial and no subscription", { planOverride: "comp" }],
    ["on trial", { trialEndsAt: daysFromNow(5) }],
    [
      "subscribed",
      { subscription: { status: "active" as const, currentPeriodEnd: daysFromNow(20) } },
    ],
  ])("lets a household through when it is %s", async (_label, facts) => {
    session = { householdId: "h1", user: { id: "u1" }, access: accessFor(facts) };
    await expect(ask()).resolves.toEqual({ ok: true, data: ["uno"] });
  });

  it("gates nothing while billing is switched off", async () => {
    billingEnabled = false;
    session = {
      householdId: "h1",
      user: { id: "u1" },
      access: accessFor({ trialEndsAt: daysFromNow(-1) }),
    };
    await expect(ask()).resolves.toMatchObject({ ok: true });
  });
});

describe("AI daily limit", () => {
  it("is counted in the database, per household and person", async () => {
    session = {
      householdId: "h1",
      user: { id: "u1" },
      access: accessFor({ planOverride: "comp" }),
    };
    await ask();
    expect(consumeAiQuota).toHaveBeenCalledWith("h1", "u1", "breakdown", expect.any(String), 30);
  });

  it("answers 'limit' when the database says the day is used up", async () => {
    session = {
      householdId: "h1",
      user: { id: "u1" },
      access: accessFor({ planOverride: "comp" }),
    };
    consumeAiQuota.mockResolvedValue(false);
    await expect(ask()).resolves.toEqual({ ok: false, error: "limit" });
    expect(breakdownTask).not.toHaveBeenCalled();
  });
});
