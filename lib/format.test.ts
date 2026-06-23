import { describe, it, expect } from "vitest";
import { formatMinutes, formatClock } from "./format";

describe("formatMinutes", () => {
  it("formats minutes under an hour", () => {
    expect(formatMinutes(45)).toBe("45m");
  });
  it("formats whole hours", () => {
    expect(formatMinutes(120)).toBe("2h");
  });
  it("formats hours and minutes", () => {
    expect(formatMinutes(90)).toBe("1h 30m");
  });
  it("guards zero/negative", () => {
    expect(formatMinutes(0)).toBe("0m");
  });
});

describe("formatClock", () => {
  it("shows hours even when zero", () => {
    expect(formatClock(1429)).toBe("0:23:49");
  });
  it("pads minutes and seconds", () => {
    expect(formatClock(3661)).toBe("1:01:01");
  });
  it("guards negatives", () => {
    expect(formatClock(-5)).toBe("0:00:00");
  });
});
