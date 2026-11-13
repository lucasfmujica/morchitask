import { describe, expect, it } from "vitest";
import type { BillingFacts } from "./billing";
import { mayNotify, trialReminderDays } from "./push-audience";

const NOW = new Date("2026-11-13T11:00:00.000Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const facts = (over: Partial<BillingFacts> = {}): BillingFacts => ({
  planOverride: null,
  trialEndsAt: null,
  subscription: null,
  ...over,
});

describe("mayNotify", () => {
  it("always lets a comped household through, whatever else is true", () => {
    expect(mayNotify(facts({ planOverride: "comp", trialEndsAt: inDays(-90) }), true, NOW)).toBe(
      true,
    );
  });

  it("lets trial and paying households through", () => {
    expect(mayNotify(facts({ trialEndsAt: inDays(4) }), true, NOW)).toBe(true);
    expect(
      mayNotify(
        facts({ subscription: { status: "active", currentPeriodEnd: inDays(20) } }),
        true,
        NOW,
      ),
    ).toBe(true);
  });

  it("skips a household whose trial ran out", () => {
    // The crons had no access check: this one got "plan your day" every
    // morning for an app that opened on the paywall.
    expect(mayNotify(facts({ trialEndsAt: inDays(-1) }), true, NOW)).toBe(false);
  });

  it("gates nobody while billing is off", () => {
    expect(mayNotify(facts({ trialEndsAt: inDays(-1) }), false, NOW)).toBe(true);
  });
});

describe("trialReminderDays", () => {
  it("names the days left inside the last three", () => {
    expect(trialReminderDays(facts({ trialEndsAt: inDays(2.5) }), true, NOW)).toBe(3);
    expect(trialReminderDays(facts({ trialEndsAt: inDays(0.5) }), true, NOW)).toBe(1);
  });

  it("stays quiet before the window, after the trial, and for anyone not on trial", () => {
    expect(trialReminderDays(facts({ trialEndsAt: inDays(6) }), true, NOW)).toBeNull();
    expect(trialReminderDays(facts({ trialEndsAt: inDays(-1) }), true, NOW)).toBeNull();
    expect(
      trialReminderDays(facts({ planOverride: "comp", trialEndsAt: inDays(2) }), true, NOW),
    ).toBeNull();
    expect(
      trialReminderDays(
        facts({
          trialEndsAt: inDays(2),
          subscription: { status: "active", currentPeriodEnd: inDays(30) },
        }),
        true,
        NOW,
      ),
    ).toBeNull();
  });

  it("says nothing while billing is off: the trial ends into nothing", () => {
    expect(trialReminderDays(facts({ trialEndsAt: inDays(2) }), false, NOW)).toBeNull();
  });
});
