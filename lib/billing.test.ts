/**
 * Every case here is somebody locked out of their own calendar, or somebody
 * using the app for free forever. Those are the only two ways this function can
 * be wrong, and both are expensive.
 */
import { describe, expect, it } from "vitest";
import {
  billingScreen,
  DUNNING_GRACE_DAYS,
  resolveAccess,
  shouldWarnAboutTrial,
  trialChip,
  trialEndFrom,
  WEBHOOK_GRACE_DAYS,
  type Access,
  type BillingFacts,
} from "./billing";
import { TRIAL_DAYS } from "./pricing";

const NOW = new Date("2026-09-01T12:00:00.000Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

const facts = (over: Partial<BillingFacts> = {}): BillingFacts => ({
  planOverride: null,
  trialEndsAt: null,
  subscription: null,
  ...over,
});

describe("comp", () => {
  it("never expires, and does not need a subscription or a trial", () => {
    const a = resolveAccess(facts({ planOverride: "comp" }), NOW);
    expect(a).toMatchObject({ allowed: true, source: "comp", until: null });
  });

  it("wins even when everything else has run out", () => {
    const a = resolveAccess(
      facts({
        planOverride: "comp",
        trialEndsAt: at(-100),
        subscription: { status: "unpaid", currentPeriodEnd: at(-100) },
      }),
      NOW,
    );
    expect(a.allowed).toBe(true);
  });

  it("does not treat an unknown override as a free pass", () => {
    expect(resolveAccess(facts({ planOverride: "vip" }), NOW).allowed).toBe(false);
  });
});

describe("trial", () => {
  it("lets someone in and counts the days down", () => {
    const a = resolveAccess(facts({ trialEndsAt: at(5) }), NOW);
    expect(a).toMatchObject({ allowed: true, source: "trial", trialDaysLeft: 5 });
  });

  it("closes when it ends, and stops counting below zero", () => {
    const a = resolveAccess(facts({ trialEndsAt: at(-1) }), NOW);
    expect(a.allowed).toBe(false);
    expect(a.trialDaysLeft).toBe(0);
  });

  it("blocks a household that never had one", () => {
    expect(resolveAccess(facts(), NOW)).toMatchObject({ allowed: false, source: "none" });
  });

  it("starts one that lasts exactly what the pricing page promises", () => {
    const ends = new Date(trialEndFrom(NOW)).getTime();
    expect((ends - NOW.getTime()) / DAY).toBe(TRIAL_DAYS);
  });
});

describe("subscription", () => {
  it("lets an active one in through the period it paid for", () => {
    const a = resolveAccess(
      facts({ subscription: { status: "active", currentPeriodEnd: at(20) } }),
      NOW,
    );
    expect(a).toMatchObject({ allowed: true, source: "subscription" });
  });

  it("survives a webhook that never arrived, but not forever", () => {
    const justOver = facts({ subscription: { status: "active", currentPeriodEnd: at(-1) } });
    expect(resolveAccess(justOver, NOW).allowed).toBe(true);

    const longOver = facts({
      subscription: { status: "active", currentPeriodEnd: at(-WEBHOOK_GRACE_DAYS - 1) },
    });
    expect(resolveAccess(longOver, NOW).allowed).toBe(false);
  });

  it("keeps a failing card working while the bank is retried", () => {
    const a = resolveAccess(
      facts({ subscription: { status: "past_due", currentPeriodEnd: at(-3) } }),
      NOW,
    );
    expect(a.allowed).toBe(true);
    // The banner asking them to fix the card keys on this, not on the status.
    expect(a.paymentFailing).toBe(true);
  });

  it("gives up once the retries have run their course", () => {
    const a = resolveAccess(
      facts({
        subscription: { status: "past_due", currentPeriodEnd: at(-DUNNING_GRACE_DAYS - 1) },
      }),
      NOW,
    );
    expect(a.allowed).toBe(false);
  });

  it("lets a cancelled subscription run out its paid period, with no grace on top", () => {
    const inside = facts({ subscription: { status: "canceled", currentPeriodEnd: at(3) } });
    expect(resolveAccess(inside, NOW).allowed).toBe(true);

    // One day past the period: cancelling is a decision, so there is nothing to
    // be generous about — unlike a late webhook or a declined card.
    const outside = facts({ subscription: { status: "canceled", currentPeriodEnd: at(-1) } });
    expect(resolveAccess(outside, NOW).allowed).toBe(false);
  });

  it("gives nothing for a subscription that never completed", () => {
    for (const status of ["incomplete", "incomplete_expired", "unpaid", "paused"] as const) {
      const a = resolveAccess(facts({ subscription: { status, currentPeriodEnd: at(30) } }), NOW);
      expect(a.allowed, status).toBe(false);
    }
  });
});

describe("when more than one thing grants access", () => {
  it("takes the trial when it outlasts a dead subscription", () => {
    const a = resolveAccess(
      facts({
        trialEndsAt: at(10),
        subscription: { status: "canceled", currentPeriodEnd: at(-30) },
      }),
      NOW,
    );
    expect(a).toMatchObject({ allowed: true, source: "trial" });
  });

  it("takes the subscription when it outlasts a spent trial", () => {
    const a = resolveAccess(
      facts({
        trialEndsAt: at(-30),
        subscription: { status: "active", currentPeriodEnd: at(10) },
      }),
      NOW,
    );
    expect(a).toMatchObject({ allowed: true, source: "subscription" });
  });

  it("locks out only when every source is spent", () => {
    const a = resolveAccess(
      facts({
        trialEndsAt: at(-30),
        subscription: { status: "canceled", currentPeriodEnd: at(-10) },
      }),
      NOW,
    );
    expect(a.allowed).toBe(false);
  });
});

describe("mixed timestamp formats", () => {
  // Postgres renders a timestamptz as "2026-09-01 18:00:00+00" and the grace
  // periods here produce "2026-09-01T06:00:00.000Z". Compared as strings, the
  // space at index 10 sorts before the "T", so the *later* Postgres timestamp
  // looks earlier and the wrong source wins.
  //
  // The two below are the same calendar day on purpose: with different days the
  // comparison is right by accident, which is exactly why this went unnoticed
  // until a test made the days match.
  const SAME_DAY_LATER = "2026-09-01 18:00:00+00"; // six hours from NOW
  const SAME_DAY_EARLIER = "2026-09-01T06:00:00.000Z"; // six hours before NOW

  it("keeps a trial that outlasts a subscription ending the same day", () => {
    const a = resolveAccess(
      {
        planOverride: null,
        trialEndsAt: SAME_DAY_LATER,
        subscription: { status: "canceled", currentPeriodEnd: SAME_DAY_EARLIER },
      },
      NOW,
    );
    // Sorted as strings this comes back locked out, because the still-running
    // trial is judged to have ended before the dead subscription did.
    expect(a).toMatchObject({ allowed: true, source: "trial" });
  });

  it("still expires a trial written in that format", () => {
    const a = resolveAccess(facts({ trialEndsAt: "2026-08-31 18:00:00+00" }), NOW);
    expect(a.allowed).toBe(false);
  });
});

describe("shouldWarnAboutTrial", () => {
  it("warns near the end of a trial and not before", () => {
    expect(shouldWarnAboutTrial(resolveAccess(facts({ trialEndsAt: at(2) }), NOW))).toBe(true);
    expect(shouldWarnAboutTrial(resolveAccess(facts({ trialEndsAt: at(9) }), NOW))).toBe(false);
  });

  it("does not warn a paying customer, whatever their period end says", () => {
    const a = resolveAccess(
      facts({ trialEndsAt: at(1), subscription: { status: "active", currentPeriodEnd: at(300) } }),
      NOW,
    );
    expect(shouldWarnAboutTrial(a)).toBe(false);
  });

  it("does not warn someone already locked out — that is a different screen", () => {
    expect(shouldWarnAboutTrial(resolveAccess(facts({ trialEndsAt: at(-1) }), NOW))).toBe(false);
  });
});

describe("trialChip", () => {
  it("shows the calm chip for the whole trial, filling as days go", () => {
    const chip = trialChip(resolveAccess(facts({ trialEndsAt: at(9) }), NOW));
    expect(chip).toEqual({ variant: "normal", daysLeft: 9, usedPct: 36, endsAt: at(9) });
    expect(trialChip(resolveAccess(facts({ trialEndsAt: at(TRIAL_DAYS) }), NOW))?.usedPct).toBe(0);
  });

  it("warms up exactly when the banner's warning would", () => {
    const access = resolveAccess(facts({ trialEndsAt: at(2) }), NOW);
    expect(trialChip(access)?.variant).toBe("late");
    expect(shouldWarnAboutTrial(access)).toBe(true);
    expect(trialChip(resolveAccess(facts({ trialEndsAt: at(4) }), NOW))?.variant).toBe("normal");
  });

  it("is never shown to a comped household, even one with an old trial date", () => {
    const access = resolveAccess(facts({ planOverride: "comp", trialEndsAt: at(5) }), NOW);
    expect(trialChip(access)).toBeNull();
  });

  it("is never shown to a subscriber, even mid-trial", () => {
    const access = resolveAccess(
      facts({ trialEndsAt: at(5), subscription: { status: "active", currentPeriodEnd: at(30) } }),
      NOW,
    );
    expect(trialChip(access)).toBeNull();
  });

  it("is not shown once the trial is over, or with billing off", () => {
    expect(trialChip(resolveAccess(facts({ trialEndsAt: at(-1) }), NOW))).toBeNull();
    // What the session callback hands out when billing is switched off.
    expect(
      trialChip({
        allowed: true,
        source: "none",
        until: null,
        trialDaysLeft: null,
        paymentFailing: false,
      }),
    ).toBeNull();
  });
});

describe("billingScreen", () => {
  const now = new Date("2026-11-20T12:00:00.000Z");
  const access = (over: Partial<Access>): Access => ({
    allowed: true,
    source: "trial",
    until: null,
    trialDaysLeft: 3,
    paymentFailing: false,
    ...over,
  });

  it("never offers anything to a comped space", () => {
    expect(billingScreen(access({ source: "comp" }), null, { managedByOther: true })).toEqual({
      kind: "comp",
    });
  });

  it("measures the dunning grace from the failed renewal", () => {
    const s = billingScreen(
      access({ source: "subscription", paymentFailing: true, until: "2026-11-27T12:00:00.000Z" }),
      { status: "past_due", current_period_end: "2026-11-13T12:00:00.000Z" },
      { managedByOther: false, now },
    );
    expect(s).toEqual({
      kind: "pastDue",
      cutoff: "2026-11-27T12:00:00.000Z",
      spentPct: 50,
      failedOn: "2026-11-13T12:00:00.000Z",
    });
  });

  it("tells a cancelled subscription apart from a trial that ran out", () => {
    const locked = access({ allowed: false, source: "subscription", trialDaysLeft: 0 });
    expect(
      billingScreen(
        locked,
        { status: "canceled", current_period_end: "2026-11-02T00:00:00.000Z" },
        { managedByOther: false, now },
      ),
    ).toEqual({ kind: "ended", endedOn: "2026-11-02T00:00:00.000Z" });
    expect(
      billingScreen(access({ allowed: false, source: "trial" }), null, { managedByOther: false }),
    ).toEqual({
      kind: "trialEnded",
    });
  });

  // Regression: the member who never paid was offered a checkout for a plan
  // whose card and invoices are the other member's.
  it("sends a locked member whose partner pays to the partner, not to a checkout", () => {
    expect(
      billingScreen(
        access({ allowed: false, source: "subscription" }),
        { status: "canceled", current_period_end: "2026-11-02T00:00:00.000Z" },
        { managedByOther: true },
      ),
    ).toEqual({ kind: "managedElsewhere" });
  });

  it("gives an exhausted dunning the plain lock, not 'your trial ended'", () => {
    expect(
      billingScreen(
        access({ allowed: false, source: "trial" }),
        { status: "unpaid", current_period_end: "2026-10-01T00:00:00.000Z" },
        { managedByOther: false },
      ),
    ).toEqual({ kind: "locked" });
  });
});
