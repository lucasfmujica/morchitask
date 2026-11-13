import { describe, expect, it } from "vitest";
import { elapsedLabel, paymentConfirmed } from "./payment-confirmation";

const access = (over = {}) => ({
  allowed: true,
  source: "subscription" as const,
  until: null,
  trialDaysLeft: null,
  paymentFailing: false,
  ...over,
});

describe("payment confirmation", () => {
  it("is done once access comes from a live subscription", () => {
    expect(paymentConfirmed({ access: access(), subscription: sub("active") })).toBe(true);
  });

  // Regression guard: a trial still running looks "allowed", and treating that
  // as paid would show "Listo" before Polar ever confirmed anything.
  it("is not done while access still comes from the trial", () => {
    expect(paymentConfirmed({ access: access({ source: "trial" }), subscription: null })).toBe(
      false,
    );
  });

  it("is not done for a cancelled subscription still inside its period", () => {
    expect(paymentConfirmed({ access: access(), subscription: sub("canceled") })).toBe(false);
  });

  it("counts like a clock", () => {
    expect(elapsedLabel(9.6)).toBe("0:09");
    expect(elapsedLabel(62)).toBe("1:02");
    expect(elapsedLabel(-1)).toBe("0:00");
  });
});

function sub(status: string) {
  return {
    status,
    recurring_interval: "year",
    current_period_end: null,
    cancel_at_period_end: false,
  };
}
