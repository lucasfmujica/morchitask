import { beforeEach, describe, expect, it, vi } from "vitest";

const recordCheckoutStarted = vi.fn();
const createCheckoutUrl = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "app.test" }) }));
vi.mock("@/lib/auth", () => ({
  auth: async () => ({ householdId: "h1", user: { id: "u1", email: "a@b.test" } }),
}));
vi.mock("@/lib/billing-config", () => ({ isBillingEnabled: () => true }));
vi.mock("@/lib/polar", () => ({ createCheckoutUrl, createPortalUrl: vi.fn() }));
vi.mock("@/lib/db/queries/subscriptions", () => ({
  getSubscription: vi.fn(),
  recordCheckoutStarted,
}));

const { startCheckout } = await import("./billing");

describe("startCheckout", () => {
  beforeEach(() => {
    recordCheckoutStarted.mockReset();
    createCheckoutUrl.mockReset();
  });

  it("records the start for the funnel, for the signed-in person", async () => {
    createCheckoutUrl.mockResolvedValue("https://polar.test/checkout");
    await expect(startCheckout("month")).resolves.toBe("https://polar.test/checkout");
    expect(recordCheckoutStarted).toHaveBeenCalledWith("h1", "u1");
  });

  it("records nothing when Polar could not open a checkout", async () => {
    createCheckoutUrl.mockRejectedValue(new Error("polar down"));
    await expect(startCheckout("month")).rejects.toThrow("polar down");
    expect(recordCheckoutStarted).not.toHaveBeenCalled();
  });

  it("still sends the person to pay when recording fails", async () => {
    createCheckoutUrl.mockResolvedValue("https://polar.test/checkout");
    recordCheckoutStarted.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(startCheckout("year")).resolves.toBe("https://polar.test/checkout");
    err.mockRestore();
  });
});
