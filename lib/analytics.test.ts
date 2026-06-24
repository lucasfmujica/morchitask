import { describe, it, expect } from "vitest";
import {
  completion,
  completionRate,
  estimatedVsActual,
  filterByDays,
  minutesByChannel,
  ownerStats,
} from "./analytics";
import type { AnalyticsTask } from "@/lib/queries/tasks";

function task(p: Partial<AnalyticsTask>): AnalyticsTask {
  return {
    planned_date: "2026-06-24",
    status: "todo",
    time_estimate_min: null,
    actual_time_min: null,
    channel_id: null,
    owner_id: "lucas",
    ...p,
  };
}

describe("filterByDays", () => {
  it("keeps only tasks whose planned_date is in the set", () => {
    const tasks = [
      task({ planned_date: "2026-06-22" }),
      task({ planned_date: "2026-06-24" }),
      task({ planned_date: null }),
    ];
    const out = filterByDays(tasks, new Set(["2026-06-22"]));
    expect(out).toHaveLength(1);
    expect(out[0].planned_date).toBe("2026-06-22");
  });
});

describe("completion / completionRate", () => {
  it("counts done vs total", () => {
    const tasks = [task({ status: "done" }), task({ status: "todo" }), task({ status: "done" })];
    const c = completion(tasks);
    expect(c).toEqual({ total: 3, done: 2 });
    expect(completionRate(c)).toBeCloseTo(2 / 3);
  });
  it("rate is 0 with no tasks", () => {
    expect(completionRate(completion([]))).toBe(0);
  });
});

describe("estimatedVsActual", () => {
  it("only counts tasks with tracked time", () => {
    const tasks = [
      task({ time_estimate_min: 60, actual_time_min: 75 }),
      task({ time_estimate_min: 30, actual_time_min: null }), // ignored
      task({ time_estimate_min: null, actual_time_min: 20 }),
    ];
    expect(estimatedVsActual(tasks)).toEqual({
      estimatedMin: 60,
      actualMin: 95,
      trackedCount: 2,
    });
  });
  it("is all-zero with nothing tracked", () => {
    expect(estimatedVsActual([task({ time_estimate_min: 60 })])).toEqual({
      estimatedMin: 0,
      actualMin: 0,
      trackedCount: 0,
    });
  });
});

describe("minutesByChannel", () => {
  it("sums planned minutes per channel, none-bucketed", () => {
    const tasks = [
      task({ channel_id: "a", time_estimate_min: 30 }),
      task({ channel_id: "a", time_estimate_min: 15 }),
      task({ channel_id: null, time_estimate_min: 60 }),
    ];
    const m = minutesByChannel(tasks);
    expect(m.get("a")).toBe(45);
    expect(m.get("none")).toBe(60);
  });
});

describe("ownerStats", () => {
  it("splits totals per owner", () => {
    const tasks = [
      task({ owner_id: "lucas", status: "done", time_estimate_min: 30 }),
      task({ owner_id: "lucas", status: "todo", time_estimate_min: 15 }),
      task({ owner_id: "sofi", status: "done", time_estimate_min: 60 }),
    ];
    const m = ownerStats(tasks);
    expect(m.get("lucas")).toEqual({ total: 2, done: 1, plannedMin: 45 });
    expect(m.get("sofi")).toEqual({ total: 1, done: 1, plannedMin: 60 });
  });
});
