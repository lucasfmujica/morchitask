import { describe, expect, it } from "vitest";
import { canHaveWorked, resolveWorkGoal, WORK_GOAL_MIN, workedByDay, workedState } from "./worked";

describe("resolveWorkGoal", () => {
  it("is 5h unless a personal goal is given", () => {
    expect(WORK_GOAL_MIN).toBe(300);
    expect(resolveWorkGoal()).toBe(300);
    expect(resolveWorkGoal(null)).toBe(300);
    expect(resolveWorkGoal(0)).toBe(300);
    expect(resolveWorkGoal(240)).toBe(240);
  });
});

describe("workedState", () => {
  it("fills in proportion to the goal", () => {
    expect(workedState(85)).toEqual({ pct: 28, reached: false, leftMin: 215 });
    expect(workedState(150)).toEqual({ pct: 50, reached: false, leftMin: 150 });
  });

  it("caps at 100 and reads as reached past the goal, never as over", () => {
    expect(workedState(300)).toEqual({ pct: 100, reached: true, leftMin: 0 });
    expect(workedState(420)).toEqual({ pct: 100, reached: true, leftMin: 0 });
  });

  it("agrees with the label: 299.6 prints as 5h, so it counts as reached", () => {
    expect(workedState(299.6).reached).toBe(true);
    expect(workedState(299.4)).toMatchObject({ reached: false, leftMin: 1 });
  });

  it("treats nothing tracked, negatives and garbage as zero", () => {
    expect(workedState(0)).toEqual({ pct: 0, reached: false, leftMin: 300 });
    expect(workedState(-20)).toEqual({ pct: 0, reached: false, leftMin: 300 });
    expect(workedState(Number.NaN)).toEqual({ pct: 0, reached: false, leftMin: 300 });
  });

  it("uses the goal it is given", () => {
    expect(workedState(120, 240)).toEqual({ pct: 50, reached: false, leftMin: 120 });
    expect(workedState(10, 0)).toEqual({ pct: 0, reached: false, leftMin: 0 });
  });
});

describe("canHaveWorked", () => {
  it("is true up to today and false after, by date not by label", () => {
    expect(canHaveWorked("2026-11-10", "2026-11-11")).toBe(true);
    expect(canHaveWorked("2026-11-11", "2026-11-11")).toBe(true);
    expect(canHaveWorked("2026-11-12", "2026-11-11")).toBe(false);
    // Across a month boundary, where a day-of-month comparison would lie.
    expect(canHaveWorked("2026-12-01", "2026-11-30")).toBe(false);
  });
});

describe("workedByDay", () => {
  it("sums per day and skips empty or invalid rows", () => {
    const m = workedByDay([
      { day: "2026-11-10", minutes: 30 },
      { day: "2026-11-10", minutes: 25.5 },
      { day: "2026-11-11", minutes: 0 },
      { day: "2026-11-12", minutes: Number.NaN },
      // Postgres numeric can arrive as a string over the wire.
      { day: "2026-11-13", minutes: "40" as unknown as number },
    ]);
    expect([...m.entries()]).toEqual([
      ["2026-11-10", 55.5],
      ["2026-11-13", 40],
    ]);
  });
});
