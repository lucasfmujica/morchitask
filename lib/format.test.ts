import { describe, it, expect } from "vitest";
import { formatMinutes, formatClock, formatDuration, parseDuration } from "./format";

describe("parseDuration", () => {
  it("reads a plain number as minutes", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("45")).toBe(45);
  });
  it("reads unit tokens in any combination", () => {
    expect(parseDuration("90m")).toBe(90);
    expect(parseDuration("45min")).toBe(45);
    expect(parseDuration("1h")).toBe(60);
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("2h15m")).toBe(135);
  });
  it("reads the '1h30' shorthand and clock form", () => {
    expect(parseDuration("1h30")).toBe(90);
    expect(parseDuration("0:45")).toBe(45);
    expect(parseDuration("2:05")).toBe(125);
  });
  it("keeps fractional minutes from seconds", () => {
    expect(parseDuration("1m 30s")).toBe(1.5);
    expect(parseDuration("30s")).toBe(0.5);
  });
  it("returns null for empty, zero, or garbage, and caps at 24h", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("hola")).toBeNull();
    expect(parseDuration("100h")).toBe(1440);
  });
});

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
