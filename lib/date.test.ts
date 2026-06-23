import { describe, it, expect } from "vitest";
import {
  dayISOInTimeZone,
  addDays,
  addMonths,
  weekRange,
  relativeLabel,
  fullDayLabel,
  monthGrid,
  monthOf,
  blockInstant,
  timeInTimeZone,
  minutesFromMidnight,
} from "./date";

const BA = "America/Argentina/Buenos_Aires"; // UTC-3

describe("dayISOInTimeZone (the midnight-boundary bug)", () => {
  it("resolves the day in the household timezone, not UTC", () => {
    // 02:00 UTC on the 23rd is still 23:00 on the 22nd in Buenos Aires.
    expect(dayISOInTimeZone(new Date("2026-06-23T02:00:00Z"), BA)).toBe("2026-06-22");
    // 04:00 UTC on the 23rd is 01:00 on the 23rd in Buenos Aires.
    expect(dayISOInTimeZone(new Date("2026-06-23T04:00:00Z"), BA)).toBe("2026-06-23");
  });
});

describe("addDays", () => {
  it("adds and subtracts days", () => {
    expect(addDays("2026-06-22", 1)).toBe("2026-06-23");
    expect(addDays("2026-06-22", -1)).toBe("2026-06-21");
  });
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("weekRange", () => {
  it("returns 7 consecutive days starting on Monday and includes the day", () => {
    const week = weekRange("2026-06-24", 1);
    expect(week).toHaveLength(7);
    expect(new Date(week[0] + "T00:00:00").getDay()).toBe(1); // Monday
    expect(week).toContain("2026-06-24");
    for (let i = 1; i < week.length; i++) {
      expect(week[i]).toBe(addDays(week[i - 1], 1));
    }
  });
});

describe("relativeLabel", () => {
  it("labels today, tomorrow and yesterday", () => {
    expect(relativeLabel("2026-06-22", "2026-06-22")).toBe("Hoy");
    expect(relativeLabel("2026-06-23", "2026-06-22")).toBe("Mañana");
    expect(relativeLabel("2026-06-21", "2026-06-22")).toBe("Ayer");
  });
  it("falls back to a Spanish date otherwise", () => {
    expect(relativeLabel("2026-06-30", "2026-06-22")).toMatch(/junio/);
  });
});

describe("fullDayLabel", () => {
  it("capitalizes the weekday", () => {
    expect(fullDayLabel("2026-06-24")).toMatch(/^[A-ZÁÉÍÓÚ]/);
  });
});

describe("time-blocking (timezone round-trip)", () => {
  it("converts a local time to a UTC instant (Buenos Aires is UTC-3)", () => {
    // 09:00 in Buenos Aires == 12:00 UTC.
    expect(blockInstant("2026-06-22", "09:00", BA)).toBe("2026-06-22T12:00:00.000Z");
  });
  it("round-trips back to the same local time", () => {
    const instant = blockInstant("2026-06-22", "09:30", BA);
    expect(timeInTimeZone(instant, BA)).toBe("09:30");
    expect(minutesFromMidnight(instant, BA)).toBe(9 * 60 + 30);
  });
});

describe("addMonths", () => {
  it("shifts months and years", () => {
    expect(addMonths("2026-06-15", 1)).toBe("2026-07-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("monthGrid", () => {
  const grid = monthGrid("2026-06-10", 1);
  it("is a 6×7 grid that starts on Monday", () => {
    expect(grid).toHaveLength(6);
    grid.forEach((week) => expect(week).toHaveLength(7));
    expect(new Date(grid[0][0] + "T00:00:00").getDay()).toBe(1); // Monday
  });
  it("contains every day of the target month", () => {
    const flat = grid.flat();
    expect(flat).toContain("2026-06-01");
    expect(flat).toContain("2026-06-30");
    expect(flat.filter((d) => monthOf(d) === "2026-06")).toHaveLength(30);
  });
  it("is 42 consecutive days", () => {
    const flat = grid.flat();
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i]).toBe(addDays(flat[i - 1], 1));
    }
  });
});
