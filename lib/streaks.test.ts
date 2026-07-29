import { describe, it, expect } from "vitest";
import { currentStreak, isExpectedOccurrence, recentOccurrences } from "./streaks";

// 2026-06-24 is a Wednesday (ISO weekday 3).
const TODAY = "2026-06-24";

describe("isExpectedOccurrence", () => {
  it("daily runs every day", () => {
    expect(isExpectedOccurrence("daily", null, TODAY)).toBe(true);
    expect(isExpectedOccurrence("daily", null, "2026-06-21")).toBe(true);
  });
  it("weekly runs only on its weekdays (ISO 1=Mon..7=Sun)", () => {
    // Wed = 3
    expect(isExpectedOccurrence("weekly", [1, 3, 5], TODAY)).toBe(true);
    // Tue 2026-06-23 = 2 → not expected
    expect(isExpectedOccurrence("weekly", [1, 3, 5], "2026-06-23")).toBe(false);
    // Sunday 2026-06-21 = 7
    expect(isExpectedOccurrence("weekly", [7], "2026-06-21")).toBe(true);
  });
  it("weekly with no days never runs", () => {
    expect(isExpectedOccurrence("weekly", [], TODAY)).toBe(false);
    expect(isExpectedOccurrence("weekly", null, TODAY)).toBe(false);
  });
});

describe("currentStreak — daily", () => {
  it("counts consecutive completed days back from today", () => {
    const done = new Set(["2026-06-24", "2026-06-23", "2026-06-22"]);
    expect(currentStreak("daily", null, done, TODAY)).toBe(3);
  });
  it("gives today grace when not done yet (streak holds)", () => {
    const done = new Set(["2026-06-23", "2026-06-22"]);
    expect(currentStreak("daily", null, done, TODAY)).toBe(2);
  });
  it("breaks on the first missed past day", () => {
    const done = new Set(["2026-06-24", "2026-06-23", "2026-06-21"]);
    expect(currentStreak("daily", null, done, TODAY)).toBe(2); // gap on the 22nd
  });
  it("is zero when yesterday was missed and today not done", () => {
    const done = new Set(["2026-06-20"]);
    expect(currentStreak("daily", null, done, TODAY)).toBe(0);
  });
});

describe("currentStreak — weekly", () => {
  // Mon/Wed/Fri routine. Relevant recent occurrences before/at Wed 2026-06-24:
  // Wed 06-24, Mon 06-22, Fri 06-19, Wed 06-17, Mon 06-15
  const days = [1, 3, 5];
  it("counts only expected days, skipping off-days", () => {
    const done = new Set(["2026-06-24", "2026-06-22", "2026-06-19"]);
    expect(currentStreak("weekly", days, done, TODAY)).toBe(3);
  });
  it("today grace works on an expected day", () => {
    const done = new Set(["2026-06-22", "2026-06-19"]);
    expect(currentStreak("weekly", days, done, TODAY)).toBe(2);
  });
  it("breaks at a missed expected occurrence", () => {
    const done = new Set(["2026-06-24", "2026-06-22"]); // 06-19 missed
    expect(currentStreak("weekly", days, done, TODAY)).toBe(2);
  });
});

describe("recentOccurrences", () => {
  it("returns the last N expected days oldest→newest with done state", () => {
    const done = new Set(["2026-06-24", "2026-06-22"]);
    const cells = recentOccurrences("daily", null, done, TODAY, 3);
    expect(cells).toEqual([
      { date: "2026-06-22", done: true },
      { date: "2026-06-23", done: false },
      { date: "2026-06-24", done: true },
    ]);
  });
  it("only includes expected weekdays", () => {
    const cells = recentOccurrences("weekly", [3], new Set(), TODAY, 2);
    // Wednesdays only: 06-17, 06-24
    expect(cells.map((c) => c.date)).toEqual(["2026-06-17", "2026-06-24"]);
  });
});

/**
 * The shutdown streak reuses `currentStreak` with freq "daily" — closing the
 * day is expected every day, so no separate implementation exists. These lock
 * in the behaviour `useShutdownStreak` depends on.
 */
describe("currentStreak as the shutdown streak", () => {
  const closed = (...days: string[]) => new Set(days);

  it("counts consecutive closed days back from today", () => {
    expect(
      currentStreak("daily", null, closed("2026-06-24", "2026-06-23", "2026-06-22"), TODAY),
    ).toBe(3);
  });

  it("gives today grace — not having closed it yet does not break the streak", () => {
    // Today is missing, yesterday and the day before are there.
    expect(currentStreak("daily", null, closed("2026-06-23", "2026-06-22"), TODAY)).toBe(2);
  });

  it("stops at the first gap", () => {
    expect(
      currentStreak("daily", null, closed("2026-06-24", "2026-06-23", "2026-06-21"), TODAY),
    ).toBe(2);
  });

  it("is 0 when nothing was ever closed", () => {
    expect(currentStreak("daily", null, closed(), TODAY)).toBe(0);
  });

  it("is 0 when only an old, disconnected run exists", () => {
    expect(currentStreak("daily", null, closed("2026-06-01", "2026-06-02"), TODAY)).toBe(0);
  });

  it("counts a streak of exactly one (today only)", () => {
    expect(currentStreak("daily", null, closed("2026-06-24"), TODAY)).toBe(1);
  });

  it("does not look past the window it is given", () => {
    const everyDay = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const d = new Date(Date.UTC(2026, 5, 24) - i * 86_400_000).toISOString().slice(0, 10);
      everyDay.add(d);
    }
    expect(currentStreak("daily", null, everyDay, TODAY, 120)).toBe(120);
  });
});
