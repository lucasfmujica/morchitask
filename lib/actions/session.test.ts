/**
 * The write gate, with the real access resolution behind it: comped, trial and
 * paying households write; a locked-out one gets a clear error and writes
 * nothing. The weekly review is checked through it because it was the one
 * planning write that only asked for a session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAccess, type BillingFacts } from "@/lib/billing";

let session: unknown;
const upsertWeeklyNoteRow = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: async () => session }));
vi.mock("@/lib/billing-config", () => ({ isBillingEnabled: () => true }));
vi.mock("@/lib/db/queries/weekly-notes", () => ({
  upsertWeeklyNote: upsertWeeklyNoteRow,
  getWeeklyNote: vi.fn(),
}));

const { requireWriteAccess } = await import("./session");
const { upsertWeeklyNote } = await import("./weekly-notes");

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const as = (facts: Partial<BillingFacts>) => {
  session = {
    householdId: "h1",
    user: { id: "u1" },
    access: resolveAccess({ planOverride: null, trialEndsAt: null, subscription: null, ...facts }),
  };
};

beforeEach(() => vi.clearAllMocks());

describe("requireWriteAccess", () => {
  it.each([
    ["comped, with no trial and no subscription at all", { planOverride: "comp" }],
    ["on trial", { trialEndsAt: inDays(3) }],
    ["subscribed", { subscription: { status: "active" as const, currentPeriodEnd: inDays(9) } }],
  ])("lets a household write when it is %s", async (_label, facts) => {
    as(facts);
    await expect(requireWriteAccess()).resolves.toEqual({ householdId: "h1", userId: "u1" });
  });

  it("refuses a household whose trial ran out, with a clear error", async () => {
    as({ trialEndsAt: inDays(-1) });
    await expect(requireWriteAccess()).rejects.toThrow("subscription required");
  });
});

describe("upsertWeeklyNote", () => {
  it("writes nothing for a locked-out household", async () => {
    as({ trialEndsAt: inDays(-1) });
    await expect(upsertWeeklyNote("2026-11-09", { wins: "x" })).rejects.toThrow(
      "subscription required",
    );
    expect(upsertWeeklyNoteRow).not.toHaveBeenCalled();
  });

  it("writes for a comped one", async () => {
    as({ planOverride: "comp" });
    await upsertWeeklyNote("2026-11-09", { wins: "x" });
    expect(upsertWeeklyNoteRow).toHaveBeenCalledWith("h1", "u1", "2026-11-09", { wins: "x" });
  });
});
