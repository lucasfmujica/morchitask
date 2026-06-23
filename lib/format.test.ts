import { describe, it, expect } from "vitest";
import { formatMinutes, formatClock, formatDuration } from "./format";

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

describe("formatDuration", () => {
  it("shows seconds under a minute", () => {
    expect(formatDuration(23)).toBe("23s");
    expect(formatDuration(5)).toBe("5s");
  });
  it("shows minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(2700)).toBe("45m");
  });
  it("shows hours and minutes", () => {
    expect(formatDuration(5400)).toBe("1h 30m");
    expect(formatDuration(3600)).toBe("1h");
  });
  it("rounds and guards negatives", () => {
    expect(formatDuration(22.998)).toBe("23s");
    expect(formatDuration(-5)).toBe("0s");
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
