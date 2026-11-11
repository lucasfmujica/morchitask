import { describe, expect, it } from "vitest";
import {
  CUT_DAY,
  HOLIDAYS,
  LAUNCH_DAY,
  LAUNCH_TOTAL_DAYS,
  PAYMENTS_TARGET,
  countedDays,
  isHoliday,
  launchDayNumber,
} from "./launch";

describe("launch calendar", () => {
  it("holds the dates from the launch plan", () => {
    expect(LAUNCH_DAY).toBe("2026-11-30");
    expect(CUT_DAY).toBe("2027-01-28");
    expect(HOLIDAYS).toEqual({ from: "2026-12-21", to: "2027-01-03" });
    expect(PAYMENTS_TARGET).toBe(15);
  });

  it("treats both ends of the holidays as holidays", () => {
    expect(isHoliday("2026-12-20")).toBe(false);
    expect(isHoliday("2026-12-21")).toBe(true);
    expect(isHoliday("2027-01-03")).toBe(true);
    expect(isHoliday("2027-01-04")).toBe(false);
  });

  it("counts 60 calendar days minus the 14 holidays", () => {
    // Nov 30 → Jan 28 is 60 days inclusive; Dec 21 → Jan 3 is 14 of them.
    expect(LAUNCH_TOTAL_DAYS).toBe(46);
  });

  it("is day 0 before launch and day 1 on launch day", () => {
    expect(launchDayNumber("2026-11-11")).toBe(0);
    expect(launchDayNumber("2026-11-29")).toBe(0);
    expect(launchDayNumber("2026-11-30")).toBe(1);
  });

  it("stops advancing over the holidays", () => {
    // Nov 30 → Dec 20 is 21 days.
    expect(launchDayNumber("2026-12-20")).toBe(21);
    expect(launchDayNumber("2026-12-25")).toBe(21);
    expect(launchDayNumber("2027-01-03")).toBe(21);
    expect(launchDayNumber("2027-01-04")).toBe(22);
  });

  it("reaches the total on the cut day and stays there", () => {
    expect(launchDayNumber(CUT_DAY)).toBe(LAUNCH_TOTAL_DAYS);
    expect(launchDayNumber("2027-03-01")).toBe(LAUNCH_TOTAL_DAYS);
  });

  it("counts nothing for a backwards range", () => {
    expect(countedDays("2026-12-02", "2026-12-01")).toBe(0);
  });
});
