import { describe, it, expect } from "vitest";
import { capacityState } from "./capacity";

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
