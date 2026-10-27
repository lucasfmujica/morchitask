import { describe, it, expect } from "vitest";
import { currentStreak, isExpectedOccurrence, recentOccurrences } from "./streaks";

// 2026-06-24 is a Wednesday (ISO weekday 3).
const TODAY = "2026-06-24";

describe("isExpectedOccurrence", () => {
  it("daily runs every day", () => {
    expect(isExpectedOccurrence({ freq: "daily", weekdays: null }, TODAY)).toBe(true);
    expect(isExpectedOccurrence({ freq: "daily", weekdays: null }, "2026-06-21")).toBe(true);
  });
  it("weekly runs only on its weekdays (ISO 1=Mon..7=Sun)", () => {
    // Wed = 3
    expect(isExpectedOccurrence({ freq: "weekly", weekdays: [1, 3, 5] }, TODAY)).toBe(true);
    // Tue 2026-06-23 = 2 → not expected
    expect(isExpectedOccurrence({ freq: "weekly", weekdays: [1, 3, 5] }, "2026-06-23")).toBe(false);
    // Sunday 2026-06-21 = 7
    expect(isExpectedOccurrence({ freq: "weekly", weekdays: [7] }, "2026-06-21")).toBe(true);
  });
  it("weekly with no days never runs", () => {
    expect(isExpectedOccurrence({ freq: "weekly", weekdays: [] }, TODAY)).toBe(false);
    expect(isExpectedOccurrence({ freq: "weekly", weekdays: null }, TODAY)).toBe(false);
  });
});

describe("currentStreak — daily", () => {
  it("counts consecutive completed days back from today", () => {
    const done = new Set(["2026-06-24", "2026-06-23", "2026-06-22"]);
    expect(currentStreak({ freq: "daily", weekdays: null }, done, TODAY)).toBe(3);
  });
  it("gives today grace when not done yet (streak holds)", () => {
    const done = new Set(["2026-06-23", "2026-06-22"]);
    expect(currentStreak({ freq: "daily", weekdays: null }, done, TODAY)).toBe(2);
  });
  it("breaks on the first missed past day", () => {
    const done = new Set(["2026-06-24", "2026-06-23", "2026-06-21"]);
    expect(currentStreak({ freq: "daily", weekdays: null }, done, TODAY)).toBe(2); // gap on the 22nd
  });
  it("is zero when yesterday was missed and today not done", () => {
    const done = new Set(["2026-06-20"]);
    expect(currentStreak({ freq: "daily", weekdays: null }, done, TODAY)).toBe(0);
  });
});

describe("currentStreak — weekly", () => {
  // Mon/Wed/Fri routine. Relevant recent occurrences before/at Wed 2026-06-24:
  // Wed 06-24, Mon 06-22, Fri 06-19, Wed 06-17, Mon 06-15
  const days = [1, 3, 5];
  it("counts only expected days, skipping off-days", () => {
    const done = new Set(["2026-06-24", "2026-06-22", "2026-06-19"]);
    expect(currentStreak({ freq: "weekly", weekdays: days }, done, TODAY)).toBe(3);
  });
  it("today grace works on an expected day", () => {
    const done = new Set(["2026-06-22", "2026-06-19"]);
    expect(currentStreak({ freq: "weekly", weekdays: days }, done, TODAY)).toBe(2);
  });
  it("breaks at a missed expected occurrence", () => {
    const done = new Set(["2026-06-24", "2026-06-22"]); // 06-19 missed
    expect(currentStreak({ freq: "weekly", weekdays: days }, done, TODAY)).toBe(2);
  });
});

describe("recentOccurrences", () => {
  it("returns the last N expected days oldest→newest with done state", () => {
    const done = new Set(["2026-06-24", "2026-06-22"]);
    const cells = recentOccurrences({ freq: "daily", weekdays: null }, done, TODAY, 3);
    expect(cells).toEqual([
      { date: "2026-06-22", done: true },
      { date: "2026-06-23", done: false },
      { date: "2026-06-24", done: true },
    ]);
  });
  it("only includes expected weekdays", () => {
    const cells = recentOccurrences({ freq: "weekly", weekdays: [3] }, new Set(), TODAY, 2);
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
      currentStreak(
        { freq: "daily", weekdays: null },
        closed("2026-06-24", "2026-06-23", "2026-06-22"),
        TODAY,
      ),
    ).toBe(3);
  });

  it("gives today grace — not having closed it yet does not break the streak", () => {
    // Today is missing, yesterday and the day before are there.
    expect(
      currentStreak({ freq: "daily", weekdays: null }, closed("2026-06-23", "2026-06-22"), TODAY),
    ).toBe(2);
  });

  it("stops at the first gap", () => {
    expect(
      currentStreak(
        { freq: "daily", weekdays: null },
        closed("2026-06-24", "2026-06-23", "2026-06-21"),
        TODAY,
      ),
    ).toBe(2);
  });

  it("is 0 when nothing was ever closed", () => {
    expect(currentStreak({ freq: "daily", weekdays: null }, closed(), TODAY)).toBe(0);
  });

  it("is 0 when only an old, disconnected run exists", () => {
    expect(
      currentStreak({ freq: "daily", weekdays: null }, closed("2026-06-01", "2026-06-02"), TODAY),
    ).toBe(0);
  });

  it("counts a streak of exactly one (today only)", () => {
    expect(currentStreak({ freq: "daily", weekdays: null }, closed("2026-06-24"), TODAY)).toBe(1);
  });

  it("does not look past the window it is given", () => {
    const everyDay = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const d = new Date(Date.UTC(2026, 5, 24) - i * 86_400_000).toISOString().slice(0, 10);
      everyDay.add(d);
    }
    expect(currentStreak({ freq: "daily", weekdays: null }, everyDay, TODAY, 120)).toBe(120);
  });
});

describe("isExpectedOccurrence — every N and monthly", () => {
  const exp = (rule: Parameters<typeof isExpectedOccurrence>[0], day: string) =>
    isExpectedOccurrence(rule, day);

  it("never runs before active_from", () => {
    expect(exp({ freq: "daily", weekdays: null, active_from: TODAY }, "2026-06-23")).toBe(false);
  });

  it("every 3 days counts from active_from", () => {
    const rule = { freq: "daily", weekdays: null, repeat_every: 3, active_from: "2026-06-01" };
    expect(exp(rule, "2026-06-01")).toBe(true);
    expect(exp(rule, "2026-06-02")).toBe(false);
    expect(exp(rule, "2026-06-04")).toBe(true);
    expect(exp(rule, "2026-07-01")).toBe(true); // 30 days later
  });

  it("every 2 weeks on Mon/Thu, anchored on the start week (even mid-week)", () => {
    // active_from Wed 2026-06-03 → its week starts Mon 2026-06-01
    const rule = { freq: "weekly", weekdays: [1, 4], repeat_every: 2, active_from: "2026-06-03" };
    expect(exp(rule, "2026-06-01")).toBe(false); // before active_from
    expect(exp(rule, "2026-06-04")).toBe(true); // Thu, week 0
    expect(exp(rule, "2026-06-08")).toBe(false); // Mon, week 1
    expect(exp(rule, "2026-06-15")).toBe(true); // Mon, week 2
    expect(exp(rule, "2026-06-16")).toBe(false); // Tue, not a chosen day
  });

  it("monthly on the 10th", () => {
    const rule = { freq: "monthly", weekdays: null, month_day: 10, active_from: "2026-01-01" };
    expect(exp(rule, "2026-03-10")).toBe(true);
    expect(exp(rule, "2026-03-11")).toBe(false);
  });

  it("monthly on the 31st lands on the last day of short months", () => {
    const rule = { freq: "monthly", weekdays: null, month_day: 31, active_from: "2026-01-01" };
    expect(exp(rule, "2026-02-28")).toBe(true);
    expect(exp(rule, "2026-02-27")).toBe(false);
    expect(exp(rule, "2026-04-30")).toBe(true);
    expect(exp(rule, "2026-05-31")).toBe(true);
    expect(exp(rule, "2026-05-30")).toBe(false);
  });

  it("monthly without month_day uses active_from's day", () => {
    const rule = { freq: "monthly", weekdays: null, active_from: "2026-05-15" };
    expect(exp(rule, "2026-06-15")).toBe(true);
    expect(exp(rule, "2026-06-14")).toBe(false);
  });

  it("every 3 months", () => {
    const rule = {
      freq: "monthly",
      weekdays: null,
      month_day: 5,
      repeat_every: 3,
      active_from: "2026-01-05",
    };
    expect(exp(rule, "2026-04-05")).toBe(true);
    expect(exp(rule, "2026-05-05")).toBe(false);
    expect(exp(rule, "2027-01-05")).toBe(true);
  });

  it("monthly streak walks back across months", () => {
    const rule = { freq: "monthly", weekdays: null, month_day: 10, active_from: "2026-01-01" };
    const done = new Set(["2026-06-10", "2026-05-10", "2026-04-10"]);
    expect(currentStreak(rule, done, TODAY)).toBe(3);
  });
});
