/**
 * Deleting an account must not leave Polar charging a space that is gone.
 *
 * The subscription row cascades with the household, so the database looked
 * clean while the card kept being charged every month. These pin the order
 * (cancel in Polar, then delete) and the two ways it must not go: deleting
 * after Polar refused, and cancelling a plan someone else is still using.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteAccount = vi.fn();
const householdMemberCount = vi.fn();
const getSubscription = vi.fn();
const revokeSubscription = vi.fn();

vi.mock("@vercel/blob", () => ({ del: vi.fn() }));
vi.mock("@/lib/actions/session", () => ({
  requireSession: async () => ({ householdId: "h1", userId: "u1" }),
}));
vi.mock("@/lib/db/queries/account", () => ({
  deleteAccount,
  householdMemberCount,
  exportAccount: vi.fn(),
}));
vi.mock("@/lib/db/queries/subscriptions", () => ({ getSubscription }));
vi.mock("@/lib/polar", () => ({ revokeSubscription }));

const { deleteMyAccount } = await import("./account");

const sub = (status: string) => ({ status, provider_subscription_id: "sub_1" });

beforeEach(() => {
  vi.clearAllMocks();
  deleteAccount.mockResolvedValue({ blobUrls: [] });
  householdMemberCount.mockResolvedValue(1);
  getSubscription.mockResolvedValue(null);
  revokeSubscription.mockResolvedValue(undefined);
});

describe("deleteMyAccount", () => {
  it.each(["active", "trialing", "past_due"])(
    "cancels a %s subscription in Polar before deleting, when this is the last person",
    async (status) => {
      getSubscription.mockResolvedValue(sub(status));
      await expect(deleteMyAccount()).resolves.toEqual({ ok: true });

      expect(revokeSubscription).toHaveBeenCalledWith("sub_1");
      expect(revokeSubscription.mock.invocationCallOrder[0]).toBeLessThan(
        deleteAccount.mock.invocationCallOrder[0],
      );
    },
  );

  it("deletes nothing when Polar could not cancel, and says why", async () => {
    getSubscription.mockResolvedValue(sub("active"));
    revokeSubscription.mockRejectedValue(new Error("polar down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(deleteMyAccount()).resolves.toEqual({ ok: false, error: "billing" });
    expect(deleteAccount).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("leaves the plan alone when someone else is still in the space", async () => {
    getSubscription.mockResolvedValue(sub("active"));
    householdMemberCount.mockResolvedValue(2);

    await expect(deleteMyAccount()).resolves.toEqual({ ok: true });
    expect(revokeSubscription).not.toHaveBeenCalled();
    expect(deleteAccount).toHaveBeenCalledWith("h1", "u1");
  });

  it.each([null, sub("canceled"), sub("unpaid")])(
    "does not call Polar when nothing is being charged (%o)",
    async (row) => {
      getSubscription.mockResolvedValue(row);
      await expect(deleteMyAccount()).resolves.toEqual({ ok: true });
      expect(revokeSubscription).not.toHaveBeenCalled();
      expect(deleteAccount).toHaveBeenCalled();
    },
  );
});
