import { describe, it, expect } from "vitest";
import {
  capacityState,
  capacitySuggestion,
  clampCapacity,
  DEFAULT_CAPACITY_MIN,
  resolveCapacity,
} from "./capacity";
import type { Task } from "./queries/types";

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

function t(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.title ?? Math.random().toString(36).slice(2),
    title: "x",
    status: "todo",
    block_start: null,
    time_estimate_min: null,
    ...overrides,
  } as unknown as Task;
}

describe("capacitySuggestion", () => {
  it("says nothing while the day fits", () => {
    expect(capacitySuggestion([t({ time_estimate_min: 60 })], 60, 360)).toBeNull();
    // Exactly on target is not over.
    expect(capacitySuggestion([t({ time_estimate_min: 360 })], 360, 360)).toBeNull();
  });

  it("suggests the biggest pending task with no block", () => {
    const tasks = [
      t({ title: "chica", time_estimate_min: 30 }),
      t({ title: "grande", time_estimate_min: 90 }),
    ];
    const s = capacitySuggestion(tasks, 405, 360);
    expect(s?.overByMin).toBe(45);
    expect(s?.task?.title).toBe("grande");
  });

  it("never suggests a task already placed in the agenda, nor a finished one", () => {
    const tasks = [
      t({ title: "agendada", time_estimate_min: 120, block_start: "09:00" }),
      t({ title: "hecha", time_estimate_min: 120, status: "done" }),
      t({ title: "libre", time_estimate_min: 30 }),
    ];
    expect(capacitySuggestion(tasks, 405, 360)?.task?.title).toBe("libre");
  });

  it("still reports the overrun when nothing is movable", () => {
    const s = capacitySuggestion([t({ time_estimate_min: 400, block_start: "09:00" })], 400, 360);
    expect(s).toMatchObject({ overByMin: 40, task: null });
  });

  it("breaks ties by title so the suggestion does not flicker", () => {
    const tasks = [
      t({ title: "b", time_estimate_min: 60 }),
      t({ title: "a", time_estimate_min: 60 }),
    ];
    expect(capacitySuggestion(tasks, 400, 360)?.task?.title).toBe("a");
  });
});
