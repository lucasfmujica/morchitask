import { describe, expect, it } from "vitest";
import {
  hasChurned,
  hasPaid,
  isActivated,
  monthlyRecurringRevenue,
  periodStart,
  stepConversion,
  summarizeFunnel,
  type HouseholdFunnelFacts,
} from "./funnel";

const SIGNUP = "2026-12-01";

describe("isActivated", () => {
  const act = (trackedDays: string[], closedDays: string[] = []) =>
    isActivated({ signupDay: SIGNUP, trackedDays, closedDays });

  it("needs three distinct days with tracked time", () => {
    expect(act(["2026-12-01", "2026-12-02"])).toBe(false);
    expect(act(["2026-12-01", "2026-12-02", "2026-12-04"])).toBe(true);
  });

  it("activates on a single closed day", () => {
    expect(act([], ["2026-12-03"])).toBe(true);
  });

  it("counts tracked days once each, however many entries they have", () => {
    expect(act(["2026-12-01", "2026-12-01", "2026-12-02"])).toBe(false);
  });

  it("ignores a closed day outside the first seven", () => {
    expect(act(["2026-12-01"], ["2026-12-08"])).toBe(false);
    expect(act([], ["2026-11-30"])).toBe(false);
  });

  it("only looks at the first seven days, sign-up day included", () => {
    // Day 7 is Dec 7; Dec 8 is outside.
    expect(act(["2026-12-05", "2026-12-06", "2026-12-07"])).toBe(true);
    expect(act(["2026-12-06", "2026-12-07", "2026-12-08"])).toBe(false);
    // Activity dated before sign-up (a timezone edge) does not count either.
    expect(act(["2026-11-30", "2026-12-01", "2026-12-02"])).toBe(false);
  });
});

describe("subscription states", () => {
  it("treats only charged statuses as paid", () => {
    expect(hasPaid({ subscriptionStatus: "active" })).toBe(true);
    expect(hasPaid({ subscriptionStatus: "canceled" })).toBe(true);
    expect(hasPaid({ subscriptionStatus: "incomplete" })).toBe(false);
    expect(hasPaid({ subscriptionStatus: "incomplete_expired" })).toBe(false);
    expect(hasPaid({ subscriptionStatus: null })).toBe(false);
  });

  it("counts an ended subscription and a scheduled cancellation as churn", () => {
    expect(hasChurned({ subscriptionStatus: "canceled", cancelAtPeriodEnd: false })).toBe(true);
    expect(hasChurned({ subscriptionStatus: "active", cancelAtPeriodEnd: true })).toBe(true);
    expect(hasChurned({ subscriptionStatus: "active", cancelAtPeriodEnd: false })).toBe(false);
    expect(hasChurned({ subscriptionStatus: null, cancelAtPeriodEnd: false })).toBe(false);
  });
});

describe("periodStart", () => {
  it("is the last seven days, the launch, or everything", () => {
    expect(periodStart("week", "2026-12-10")).toBe("2026-12-04");
    expect(periodStart("launch", "2026-12-10")).toBe("2026-11-30");
    expect(periodStart("all", "2026-12-10")).toBeNull();
  });
});

describe("summarizeFunnel", () => {
  const base: HouseholdFunnelFacts = {
    signupDay: "2026-12-01",
    trialEndsAt: "2026-12-15T12:00:00.000Z",
    subscriptionStatus: null,
    cancelAtPeriodEnd: false,
    checkoutStarted: false,
    trackedDays: [],
    closedDays: [],
  };
  const active3 = ["2026-12-01", "2026-12-02", "2026-12-03"];
  const facts: HouseholdFunnelFacts[] = [
    // Activated and paying.
    { ...base, trackedDays: active3, checkoutStarted: true, subscriptionStatus: "active" },
    // Activated, opened checkout, never paid, trial over.
    { ...base, trackedDays: active3, checkoutStarted: true },
    // Paid without a recorded checkout start (paid before recording existed).
    { ...base, signupDay: "2026-12-08", subscriptionStatus: "canceled" },
    // Signed up before launch.
    { ...base, signupDay: "2026-11-02", trialEndsAt: "2026-11-16T12:00:00.000Z" },
  ];
  const now = new Date("2026-12-20T12:00:00.000Z");

  it("counts each step over the same cohort", () => {
    const f = summarizeFunnel(facts, "launch", "2026-12-20", now);
    expect(f).toMatchObject({ trials: 3, activated: 2, checkout: 3, paid: 2, churned: 1 });
  });

  it("counts trials that ran out without a payment", () => {
    expect(summarizeFunnel(facts, "launch", "2026-12-20", now).expiredUnpaid).toBe(1);
    expect(summarizeFunnel(facts, "all", "2026-12-20", now).expiredUnpaid).toBe(2);
  });

  it("narrows the cohort by sign-up day", () => {
    expect(summarizeFunnel(facts, "week", "2026-12-14", now).trials).toBe(1);
    expect(summarizeFunnel(facts, "all", "2026-12-20", now).trials).toBe(4);
  });

  it("groups sign-ups by Monday-start week, oldest first", () => {
    const { weeks } = summarizeFunnel(facts, "all", "2026-12-20", now);
    expect(weeks).toEqual([
      { weekStart: "2026-11-02", signups: 1, activated: 0, paid: 0 },
      { weekStart: "2026-11-30", signups: 2, activated: 2, paid: 1 },
      { weekStart: "2026-12-07", signups: 1, activated: 0, paid: 1 },
    ]);
  });

  it("is all zeros with nobody in the period", () => {
    expect(summarizeFunnel([], "launch", "2026-11-11", now)).toEqual({
      trials: 0,
      activated: 0,
      checkout: 0,
      paid: 0,
      churned: 0,
      expiredUnpaid: 0,
      weeks: [],
    });
  });
});

describe("revenue and conversion", () => {
  it("adds monthly plans and a twelfth of yearly ones, at list price", () => {
    expect(monthlyRecurringRevenue({ monthly: 4, yearly: 3 })).toBe(60);
    expect(monthlyRecurringRevenue({ monthly: 0, yearly: 0 })).toBe(0);
  });

  it("rounds step conversion and refuses to divide by zero", () => {
    expect(stepConversion(24, 52)).toBe(46);
    expect(stepConversion(3, 0)).toBeNull();
  });
});
