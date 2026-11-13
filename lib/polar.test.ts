/**
 * `revokeSubscription` against a mocked Polar client: the account delete
 * depends on it throwing for a real failure and not for "already cancelled".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlreadyCanceledSubscription } from "@polar-sh/sdk/models/errors/alreadycanceledsubscription.js";

const revoke = vi.fn();

vi.mock("@polar-sh/sdk", () => ({
  Polar: class {
    subscriptions = { revoke };
  },
}));

const { revokeSubscription } = await import("./polar");

beforeEach(() => {
  revoke.mockReset();
  process.env.POLAR_ACCESS_TOKEN = "test-token";
});

describe("revokeSubscription", () => {
  it("revokes, which in Polar means cancel now rather than at period end", async () => {
    revoke.mockResolvedValue({});
    await revokeSubscription("sub_1");
    expect(revoke).toHaveBeenCalledWith({ id: "sub_1" });
  });

  it("treats an already-cancelled subscription as done", async () => {
    revoke.mockRejectedValue(
      new AlreadyCanceledSubscription(
        { error: "AlreadyCanceledSubscription", detail: "already canceled" },
        {
          response: new Response(null, { status: 403 }),
          request: new Request("https://polar.test"),
          body: "",
        },
      ),
    );
    await expect(revokeSubscription("sub_1")).resolves.toBeUndefined();
  });

  it("throws on any other failure, so the delete can stop", async () => {
    revoke.mockRejectedValue(new Error("network"));
    await expect(revokeSubscription("sub_1")).rejects.toThrow("network");
  });
});
