import { describe, it, expect } from "vitest";
import { orderBetween, orderForAppend, orderForIndex } from "./ordering";

describe("orderBetween", () => {
  it("returns the midpoint between two neighbours", () => {
    expect(orderBetween(10, 20)).toBe(15);
  });
  it("handles the empty list and the ends", () => {
    expect(orderBetween(null, null)).toBe(1000);
    expect(orderBetween(10, null)).toBe(1010); // append after 10
    expect(orderBetween(null, 1000)).toBe(0); // prepend before 1000
  });
  it("always produces a value strictly between neighbours", () => {
    const mid = orderBetween(100, 101);
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(101);
  });
});

describe("orderForAppend", () => {
  it("appends past the current maximum", () => {
    expect(orderForAppend([])).toBe(1000);
    expect(orderForAppend([1000, 3000, 2000])).toBe(4000);
  });
});

describe("orderForIndex", () => {
  const ordered = [1000, 2000, 3000];
  it("drops between the right neighbours", () => {
    expect(orderForIndex(ordered, 1)).toBe(1500);
  });
  it("drops at the start and end", () => {
    expect(orderForIndex(ordered, 0)).toBe(0);
    expect(orderForIndex(ordered, 3)).toBe(4000);
  });
});
