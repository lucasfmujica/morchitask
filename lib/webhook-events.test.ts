/**
 * This is where somebody's money becomes a row.
 *
 * Every case below is a real failure: a payload that gets dropped is a paying
 * customer who stays locked out, and a payload accepted too loosely is a
 * subscription written against the wrong household. The route around this is
 * a signature check and a status code; the judgement is all here.
 */
import { describe, expect, it } from "vitest";
import { resolveAccess } from "./billing";
import { householdIdFrom, isHandledEvent, parseSubscriptionEvent } from "./webhook-events";

const HOUSEHOLD = "11111111-0000-4000-8000-000000000000";

const payload = (over: Record<string, unknown> = {}) => ({
  id: "sub_123",
  status: "active",
  customerId: "cus_456",
  currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
  cancelAtPeriodEnd: false,
  recurringInterval: "month",
  customer: { externalId: HOUSEHOLD },
  ...over,
});

describe("placing the payment", () => {
  it("reads the household off the customer's external id", () => {
    expect(householdIdFrom(payload())).toBe(HOUSEHOLD);
  });

  it("falls back to the checkout metadata when the customer has no external id", () => {
    expect(
      householdIdFrom(payload({ customer: null, metadata: { household_id: HOUSEHOLD } })),
    ).toBe(HOUSEHOLD);
  });

  it("refuses a payload it cannot place, rather than guessing", () => {
    expect(parseSubscriptionEvent(payload({ customer: null, metadata: {} }))).toBeNull();
  });

  it("refuses one with no subscription or customer id", () => {
    expect(parseSubscriptionEvent(payload({ id: undefined }))).toBeNull();
    expect(parseSubscriptionEvent(payload({ customerId: null }))).toBeNull();
  });
});

describe("reading the subscription", () => {
  it("keeps the four facts the app stores", () => {
    expect(parseSubscriptionEvent(payload())).toEqual({
      householdId: HOUSEHOLD,
      providerSubscriptionId: "sub_123",
      providerCustomerId: "cus_456",
      status: "active",
      recurringInterval: "month",
      currentPeriodEnd: "2026-10-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      payerUserId: null,
    });
  });

  // Who manages the plan is whoever paid; the checkout says so in metadata.
  it("reads who opened the checkout, when the metadata carries it", () => {
    expect(
      parseSubscriptionEvent(payload({ metadata: { household_id: HOUSEHOLD, user_id: "u_1" } }))
        ?.payerUserId,
    ).toBe("u_1");
    expect(parseSubscriptionEvent(payload({ metadata: { user_id: 42 } }))?.payerUserId).toBeNull();
  });

  it("takes the period end as a string too — the SDK hands back a Date, raw JSON does not", () => {
    const parsed = parseSubscriptionEvent(payload({ currentPeriodEnd: "2026-10-01T00:00:00Z" }));
    expect(parsed?.currentPeriodEnd).toBe("2026-10-01T00:00:00.000Z");
  });

  it("survives a subscription with no period end", () => {
    expect(
      parseSubscriptionEvent(payload({ currentPeriodEnd: null }))?.currentPeriodEnd,
    ).toBeNull();
  });

  it("treats a nonsense date as absent instead of storing Invalid Date", () => {
    expect(
      parseSubscriptionEvent(payload({ currentPeriodEnd: "soon" }))?.currentPeriodEnd,
    ).toBeNull();
  });

  it("refuses a status it does not recognise", () => {
    // Storing it would make resolveAccess fall through to "no subscription"
    // and paywall someone who is paying — the most expensive way to be wrong.
    expect(parseSubscriptionEvent(payload({ status: "gronk" }))).toBeNull();
    expect(parseSubscriptionEvent(payload({ status: undefined }))).toBeNull();
  });

  it("only reads cancel_at_period_end as true when it really is", () => {
    expect(parseSubscriptionEvent(payload({ cancelAtPeriodEnd: "yes" }))?.cancelAtPeriodEnd).toBe(
      false,
    );
    expect(parseSubscriptionEvent(payload({ cancelAtPeriodEnd: true }))?.cancelAtPeriodEnd).toBe(
      true,
    );
  });
});

describe("which events matter", () => {
  it("acts on the subscription lifecycle", () => {
    for (const type of [
      "subscription.created",
      "subscription.active",
      "subscription.updated",
      "subscription.canceled",
      "subscription.uncanceled",
      "subscription.past_due",
      "subscription.revoked",
    ]) {
      expect(isHandledEvent(type), type).toBe(true);
    }
  });

  it("ignores everything that has no bearing on whether the app opens", () => {
    for (const type of ["order.created", "benefit.created", "product.updated", "", undefined]) {
      expect(isHandledEvent(type), String(type)).toBe(false);
    }
  });
});

describe("a revoked subscription", () => {
  const NOW = new Date("2026-09-10T12:00:00.000Z");
  // What Polar sends on revoke: cancelled, ended now, and the period end left
  // where it was, three weeks out.
  const revoked = payload({
    status: "canceled",
    endedAt: NOW,
    currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
  });
  const access = (sub: ReturnType<typeof parseSubscriptionEvent>) =>
    resolveAccess(
      {
        planOverride: null,
        trialEndsAt: null,
        subscription: { status: sub!.status, currentPeriodEnd: sub!.currentPeriodEnd },
      },
      new Date(NOW.getTime() + 60_000),
    );

  it("ends access when it ended, not at the end of the period it had paid for", () => {
    const sub = parseSubscriptionEvent(revoked, { revoked: true, now: NOW });
    expect(sub?.currentPeriodEnd).toBe(NOW.toISOString());
    expect(access(sub).allowed).toBe(false);
  });

  it("ends access even when the payload does not say when it ended", () => {
    const sub = parseSubscriptionEvent(payload({ status: "active", endedAt: null }), {
      revoked: true,
      now: NOW,
    });
    expect(sub?.status).toBe("canceled");
    expect(access(sub).allowed).toBe(false);
  });

  it("still honours a plain cancel until the end of the paid period", () => {
    // Cancelling is not revoking: they paid for the rest of the month.
    const sub = parseSubscriptionEvent(payload({ status: "canceled", endedAt: null }));
    expect(sub?.currentPeriodEnd).toBe("2026-10-01T00:00:00.000Z");
    expect(access(sub).allowed).toBe(true);
  });
});
