import { describe, it, expect } from "vitest";
import { formatMinutes } from "./format";

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
