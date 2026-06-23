import { describe, it, expect } from "vitest";
import { elapsedMinutes } from "./active-timer";

describe("elapsedMinutes", () => {
  it("rounds to the nearest minute", () => {
    expect(elapsedMinutes(0, 90_000)).toBe(2); // 1m30s → 2m
    expect(elapsedMinutes(0, 89_000)).toBe(1); // 1m29s → 1m
  });
  it("never returns negative", () => {
    expect(elapsedMinutes(100_000, 0)).toBe(0);
  });
  it("is zero for sub-30s runs", () => {
    expect(elapsedMinutes(0, 20_000)).toBe(0);
  });
});
