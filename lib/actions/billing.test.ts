import { beforeEach, describe, expect, it, vi } from "vitest";

const recordCheckoutStarted = vi.fn();
const createCheckoutUrl = vi.fn();
const getSubscription = vi.fn();
const billingManager = vi.fn();
const createPortalUrl = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "app.test" }) }));
vi.mock("@/lib/auth", () => ({
  auth: async () => ({ householdId: "h1", user: { id: "u1", email: "a@b.test" } }),
}));
vi.mock("@/lib/billing-config", () => ({ isBillingEnabled: () => true }));
vi.mock("@/lib/polar", () => ({ createCheckoutUrl, createPortalUrl }));
vi.mock("@/lib/db/queries/subscriptions", () => ({
  getSubscription,
  recordCheckoutStarted,
  billingManager,
}));
vi.mock("@/lib/db/queries/households", () => ({ getHousehold: vi.fn() }));
vi.mock("@/lib/db/queries/profiles", () => ({ getHouseholdProfiles: vi.fn(async () => []) }));

const { openBillingPortal, startCheckout } = await import("./billing");

describe("startCheckout", () => {
  beforeEach(() => {
    recordCheckoutStarted.mockReset();
    createCheckoutUrl.mockReset();
    getSubscription.mockReset();
    getSubscription.mockResolvedValue(null);
    billingManager.mockReset();
    billingManager.mockResolvedValue(null);
  });

  it("records the start for the funnel, for the signed-in person", async () => {
    createCheckoutUrl.mockResolvedValue("https://polar.test/checkout");
    await expect(startCheckout("month")).resolves.toEqual({
      ok: true,
      url: "https://polar.test/checkout",
    });
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
    await expect(startCheckout("year")).resolves.toEqual({
      ok: true,
      url: "https://polar.test/checkout",
    });
    err.mockRestore();
  });

  it.each(["active", "trialing", "past_due"])(
    "refuses a second checkout while the space has a %s subscription",
    async (status) => {
      getSubscription.mockResolvedValue({ status });
      await expect(startCheckout("month")).resolves.toEqual({
        ok: false,
        error: "already_subscribed",
      });
      expect(createCheckoutUrl).not.toHaveBeenCalled();
    },
  );

  it.each(["canceled", "unpaid", "incomplete_expired"])(
    "lets a space whose subscription is %s subscribe again",
    async (status) => {
      getSubscription.mockResolvedValue({ status });
      createCheckoutUrl.mockResolvedValue("https://polar.test/checkout");
      await expect(startCheckout("month")).resolves.toMatchObject({ ok: true });
    },
  );

  it("tells Polar who opened the checkout, for a later 'who manages billing'", async () => {
    createCheckoutUrl.mockResolvedValue("https://polar.test/checkout");
    await startCheckout("month");
    expect(createCheckoutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ householdId: "h1", userId: "u1" }),
    );
  });

  it("sends the person back to a URL that says which plan they picked", async () => {
    createCheckoutUrl.mockResolvedValue("https://polar.test/checkout");
    await startCheckout("year");
    expect(createCheckoutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ successUrl: "https://app.test/billing?checkout=done&plan=year" }),
    );
  });

  // Regression: the plan of a space whose payer is the other member could be
  // re-bought by the member who never paid, putting a second card on it.
  it("refuses a checkout when the other member manages the plan", async () => {
    getSubscription.mockResolvedValue({ status: "canceled" });
    billingManager.mockResolvedValue({ id: "u2", display_name: "Ana" });
    await expect(startCheckout("month")).resolves.toEqual({
      ok: false,
      error: "managed_by_other",
    });
    expect(createCheckoutUrl).not.toHaveBeenCalled();
  });

  it("lets the person who manages the plan subscribe again", async () => {
    getSubscription.mockResolvedValue({ status: "canceled" });
    billingManager.mockResolvedValue({ id: "u1", display_name: "Yo" });
    createCheckoutUrl.mockResolvedValue("https://polar.test/checkout");
    await expect(startCheckout("month")).resolves.toMatchObject({ ok: true });
  });
});

describe("openBillingPortal", () => {
  beforeEach(() => {
    createPortalUrl.mockReset();
    createPortalUrl.mockResolvedValue("https://polar.test/portal");
    billingManager.mockReset();
  });

  it("opens the portal for the person who pays", async () => {
    billingManager.mockResolvedValue({ id: "u1", display_name: "Yo" });
    await expect(openBillingPortal()).resolves.toBe("https://polar.test/portal");
  });

  it("opens it when nobody is recorded as paying yet (subscriptions from before the marker)", async () => {
    billingManager.mockResolvedValue(null);
    await expect(openBillingPortal()).resolves.toBe("https://polar.test/portal");
  });

  it("refuses it to the member who does not pay", async () => {
    billingManager.mockResolvedValue({ id: "u2", display_name: "Ana" });
    await expect(openBillingPortal()).rejects.toThrow("forbidden");
    expect(createPortalUrl).not.toHaveBeenCalled();
  });
});
