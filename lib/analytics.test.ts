import { describe, it, expect } from "vitest";
import {
  completion,
  completionRate,
  estimatedVsActual,
  bestWorkedDay,
  estimateVsTracked,
  filterByDays,
  ownerStats,
  trackedByCategory,
  workedSummary,
} from "./analytics";
import type { AnalyticsTask, TrackedTask } from "@/lib/queries/tasks";

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

describe("ownerStats", () => {
  it("splits totals per owner", () => {
    const tasks = [
      task({ owner_id: "lucas", status: "done", time_estimate_min: 30 }),
      task({ owner_id: "lucas", status: "todo", time_estimate_min: 15 }),
      task({ owner_id: "sofi", status: "done", time_estimate_min: 60 }),
    ];
    const m = ownerStats(tasks);
    // Counts only: no hours, so a partner's time can't reach the screen.
    expect(m.get("lucas")).toEqual({ total: 2, done: 1 });
    expect(m.get("sofi")).toEqual({ total: 1, done: 1 });
  });
});

const WEEK = [
  "2026-11-09",
  "2026-11-10",
  "2026-11-11",
  "2026-11-12",
  "2026-11-13",
  "2026-11-14",
  "2026-11-15",
];

describe("workedSummary", () => {
  it("sets the goal by the days up to today, never the future ones", () => {
    const byDay = new Map([
      ["2026-11-09", 320],
      ["2026-11-10", 120],
      ["2026-11-11", 300],
    ]);
    const s = workedSummary(byDay, WEEK, "2026-11-11");
    expect(s).toEqual({
      workedMin: 740,
      goalMin: 900,
      elapsedDays: 3,
      daysReached: 2,
      pct: 82,
    });
  });

  it("ignores minutes logged on a day after today", () => {
    const byDay = new Map([["2026-11-12", 500]]);
    const s = workedSummary(byDay, WEEK, "2026-11-11");
    expect(s.workedMin).toBe(0);
    expect(s.daysReached).toBe(0);
  });

  it("counts a day rounded up to the goal as reached, as the labels print it", () => {
    const s = workedSummary(new Map([["2026-11-09", 299.6]]), WEEK, "2026-11-09");
    expect(s.daysReached).toBe(1);
  });

  it("caps the ring at full when the period's goal is passed", () => {
    const s = workedSummary(new Map([["2026-11-09", 600]]), WEEK, "2026-11-09");
    expect(s.pct).toBe(100);
  });
});

describe("bestWorkedDay", () => {
  it("picks the most worked day, the first on a tie", () => {
    const byDay = new Map([
      ["2026-11-10", 200],
      ["2026-11-12", 200],
      ["2026-11-11", 50],
    ]);
    expect(bestWorkedDay(byDay, WEEK)).toBe("2026-11-10");
  });

  it("crowns nothing when nothing was worked", () => {
    expect(bestWorkedDay(new Map(), WEEK)).toBeUndefined();
  });
});

function tracked(p: Partial<TrackedTask>): TrackedTask {
  return {
    task_id: "t",
    channel_id: null,
    channel_name: null,
    channel_color: null,
    estimate_min: null,
    minutes: 0,
    ...p,
  };
}

describe("trackedByCategory", () => {
  it("sums tracked minutes per category with no estimate needed", () => {
    // The person this was built for: tracks everything, estimates nothing.
    const rows = [
      tracked({
        task_id: "1",
        channel_id: "w",
        channel_name: "Trabajo",
        channel_color: "#111",
        minutes: 90,
      }),
      tracked({
        task_id: "2",
        channel_id: "w",
        channel_name: "Trabajo",
        channel_color: "#111",
        minutes: 45,
      }),
      tracked({ task_id: "3", minutes: 200 }),
      tracked({
        task_id: "4",
        channel_id: "h",
        channel_name: "Hogar",
        channel_color: "#222",
        minutes: 0,
      }),
    ];
    expect(trackedByCategory(rows)).toEqual([
      { id: "none", name: null, color: null, min: 200 },
      { id: "w", name: "Trabajo", color: "#111", min: 135 },
    ]);
  });
});

describe("estimateVsTracked", () => {
  it("compares only the tasks that have both an estimate and tracked time", () => {
    const rows = [
      tracked({
        task_id: "1",
        channel_id: "w",
        channel_name: "Trabajo",
        estimate_min: 60,
        minutes: 75,
      }),
      tracked({ task_id: "2", channel_id: "w", channel_name: "Trabajo", minutes: 120 }),
      tracked({ task_id: "3", estimate_min: 30, minutes: 0 }),
      tracked({ task_id: "4", estimate_min: 30, minutes: 20 }),
    ];
    const r = estimateVsTracked(rows);
    expect(r.trackedCount).toBe(2);
    expect(r.estimatedMin).toBe(90);
    expect(r.actualMin).toBe(95);
    expect(r.byCategory.map((c) => [c.id, c.estimatedMin, c.actualMin])).toEqual([
      ["w", 60, 75],
      ["none", 30, 20],
    ]);
  });

  it("is empty, not zeroed rows, for someone who tracks but never estimates", () => {
    const r = estimateVsTracked([
      tracked({ minutes: 300 }),
      tracked({ task_id: "2", minutes: 60 }),
    ]);
    expect(r).toEqual({ estimatedMin: 0, actualMin: 0, trackedCount: 0, byCategory: [] });
  });
});
