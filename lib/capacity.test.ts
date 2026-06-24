import { describe, it, expect } from "vitest";
import { capacityState, clampCapacity, DEFAULT_CAPACITY_MIN, resolveCapacity } from "./capacity";

describe("clampCapacity", () => {
  it("snaps to the nearest 30 min", () => {
    expect(clampCapacity(374)).toBe(360);
    expect(clampCapacity(390)).toBe(390);
    expect(clampCapacity(405)).toBe(420); // 13.5 rounds up
  });
  it("keeps within the day range", () => {
    expect(clampCapacity(0)).toBe(30); // min
    expect(clampCapacity(5000)).toBe(960); // max 16h
  });
});

describe("resolveCapacity", () => {
  it("prefers the day's own value", () => {
    expect(resolveCapacity(240, 480)).toBe(240);
  });
  it("falls back to the profile default, then 6h", () => {
    expect(resolveCapacity(null, 480)).toBe(480);
    expect(resolveCapacity(null, null)).toBe(DEFAULT_CAPACITY_MIN);
    expect(resolveCapacity(undefined, undefined)).toBe(360);
  });
});

describe("capacityState", () => {
  it("is calm well under budget", () => {
    const s = capacityState(120, 360);
    expect(s).toMatchObject({ pct: 33, over: false, near: false, overByMin: 0 });
  });

  it("flags 'near' from 85% up to the target", () => {
    expect(capacityState(306, 360).near).toBe(true); // exactly 85%
    expect(capacityState(360, 360).near).toBe(true); // full but not over
    expect(capacityState(300, 360).near).toBe(false); // 83%
  });

  it("flags 'over' and reports the overflow once past target", () => {
    const s = capacityState(420, 360);
    expect(s.over).toBe(true);
    expect(s.near).toBe(false);
    expect(s.overByMin).toBe(60);
    expect(s.pct).toBe(100); // bar fill is clamped
  });

  it("treats a non-positive target as no budget", () => {
    expect(capacityState(120, 0)).toMatchObject({ pct: 0, over: false, overByMin: 0 });
  });

  it("is empty at zero planned", () => {
    expect(capacityState(0, 360)).toMatchObject({ pct: 0, over: false, near: false });
  });
});
