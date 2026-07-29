import { describe, it, expect } from "vitest";
import { accuracyLabel, shutdownSummary } from "./shutdown";
import type { Task } from "./queries/types";

const ME = "me";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    owner_id: ME,
    status: "todo",
    time_estimate_min: null,
    actual_time_min: null,
    ...overrides,
  } as unknown as Task;
}

describe("shutdownSummary", () => {
  it("splits done from pending", () => {
    const s = shutdownSummary(
      [task({ status: "done" }), task({ status: "todo" }), task({ status: "done" })],
      ME,
    );
    expect(s.done).toHaveLength(2);
    expect(s.pending).toHaveLength(1);
  });

  it("only counts my own tasks, not my partner's", () => {
    const s = shutdownSummary(
      [task({ status: "done" }), task({ owner_id: "sofi", status: "done" })],
      ME,
    );
    expect(s.done).toHaveLength(1);
  });

  it("sums TRACKED time, not estimated time", () => {
    // The bug this function exists to prevent: the old view summed estimates
    // and labelled the result "tiempo hecho".
    const s = shutdownSummary(
      [
        task({ status: "done", time_estimate_min: 30, actual_time_min: 45 }),
        task({ status: "done", time_estimate_min: 60, actual_time_min: 50 }),
      ],
      ME,
    );
    expect(s.actualMin).toBe(95);
    expect(s.estimatedMin).toBe(90);
  });

  it("ignores time from tasks that were not finished", () => {
    const s = shutdownSummary(
      [
        task({ status: "done", time_estimate_min: 30, actual_time_min: 30 }),
        task({ status: "todo", time_estimate_min: 999, actual_time_min: 999 }),
      ],
      ME,
    );
    expect(s.estimatedMin).toBe(30);
    expect(s.actualMin).toBe(30);
  });

  it("treats missing times as zero rather than NaN", () => {
    const s = shutdownSummary([task({ status: "done" })], ME);
    expect(s.estimatedMin).toBe(0);
    expect(s.actualMin).toBe(0);
  });

  it("computes accuracy as actual over estimated", () => {
    const s = shutdownSummary(
      [task({ status: "done", time_estimate_min: 100, actual_time_min: 150 })],
      ME,
    );
    expect(s.accuracy).toBeCloseTo(1.5);
  });

  it("returns null accuracy instead of dividing by zero", () => {
    const noEstimate = shutdownSummary([task({ status: "done", actual_time_min: 45 })], ME);
    expect(noEstimate.accuracy).toBeNull();

    const noTracking = shutdownSummary([task({ status: "done", time_estimate_min: 45 })], ME);
    expect(noTracking.accuracy).toBeNull();
  });

  it("handles an empty day", () => {
    const s = shutdownSummary([], ME);
    expect(s).toMatchObject({
      done: [],
      pending: [],
      estimatedMin: 0,
      actualMin: 0,
      accuracy: null,
    });
  });
});

describe("accuracyLabel", () => {
  it("says nothing when there is no ratio", () => {
    expect(accuracyLabel(null)).toBeNull();
  });

  it("calls anything within 10% on target", () => {
    expect(accuracyLabel(1)).toBe("Calculaste bien el día");
    expect(accuracyLabel(0.92)).toBe("Calculaste bien el día");
    expect(accuracyLabel(1.08)).toBe("Calculaste bien el día");
  });

  it("reports overrun and underrun in plain terms", () => {
    expect(accuracyLabel(1.4)).toBe("Tardaste 40% más de lo previsto");
    expect(accuracyLabel(0.7)).toBe("Terminaste 30% antes");
  });
});
