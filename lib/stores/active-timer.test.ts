import { describe, it, expect } from "vitest";
import { elapsedSeconds } from "./active-timer";

describe("elapsedSeconds", () => {
  it("floors to whole seconds", () => {
    expect(elapsedSeconds(0, 90_000)).toBe(90); // 1m30s
    expect(elapsedSeconds(0, 89_900)).toBe(89); // 1m29.9s → 89s
  });
  it("never returns negative", () => {
    expect(elapsedSeconds(100_000, 0)).toBe(0);
  });
  it("keeps sub-minute runs (no longer lost)", () => {
    expect(elapsedSeconds(0, 5_000)).toBe(5);
    expect(elapsedSeconds(0, 1_000)).toBe(1);
  });
});
