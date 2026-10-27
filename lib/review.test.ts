import { describe, it, expect } from "vitest";
import {
  isReviewWindow,
  projectedDayLoads,
  reviewWeekFor,
  weekLeftovers,
  weekStartOf,
  weekSummary,
} from "./review";

// 2026-10-26 is a Monday.
describe("weekStartOf", () => {
  it("returns the Monday of the week", () => {
    expect(weekStartOf("2026-10-29")).toBe("2026-10-26");
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26"); // Sunday
    expect(weekStartOf("2026-10-26")).toBe("2026-10-26");
  });
});

describe("reviewWeekFor", () => {
  it("reviews the current week from Friday to Sunday", () => {
    expect(reviewWeekFor("2026-10-30")).toBe("2026-10-26"); // Fri
    expect(reviewWeekFor("2026-11-01")).toBe("2026-10-26"); // Sun
  });
  it("reviews the previous week from Monday to Thursday", () => {
    expect(reviewWeekFor("2026-10-26")).toBe("2026-10-19"); // Mon
    expect(reviewWeekFor("2026-10-29")).toBe("2026-10-19"); // Thu
  });
});

describe("isReviewWindow", () => {
  it("opens Friday afternoon and closes Monday morning", () => {
    expect(isReviewWindow("2026-10-30", 10)).toBe(false); // Fri morning
    expect(isReviewWindow("2026-10-30", 16)).toBe(true); // Fri afternoon
    expect(isReviewWindow("2026-10-31", 9)).toBe(true); // Sat
    expect(isReviewWindow("2026-11-01", 22)).toBe(true); // Sun
    expect(isReviewWindow("2026-11-02", 9)).toBe(true); // Mon morning
    expect(isReviewWindow("2026-11-02", 15)).toBe(false); // Mon afternoon
    expect(isReviewWindow("2026-10-28", 15)).toBe(false); // Wed
  });
});

const task = (
  over: Partial<
    Parameters<typeof weekSummary>[0][number] & { id: string; template_id: string | null }
  >,
) => ({
  id: "t",
  template_id: null,
  planned_date: "2026-10-26",
  status: "todo",
  time_estimate_min: null,
  actual_time_min: null,
  channel_id: null,
  owner_id: "me",
  ...over,
});

describe("weekLeftovers", () => {
  it("keeps only my unfinished non-routine tasks", () => {
    const tasks = [
      task({ id: "a" }),
      task({ id: "b", status: "done" }),
      task({ id: "c", owner_id: "sofi" }),
      task({ id: "d", template_id: "r1" }),
    ];
    expect(weekLeftovers(tasks, "me").map((t) => t.id)).toEqual(["a"]);
  });
});

describe("weekSummary", () => {
  it("counts my tasks and finds the best day", () => {
    const s = weekSummary(
      [
        task({
          status: "done",
          planned_date: "2026-10-27",
          time_estimate_min: 30,
          actual_time_min: 45,
        }),
        task({ status: "done", planned_date: "2026-10-27" }),
        task({ status: "done", planned_date: "2026-10-28" }),
        task({ status: "todo" }),
        task({ status: "done", owner_id: "sofi" }),
      ],
      "me",
    );
    expect(s.done).toBe(3);
    expect(s.total).toBe(4);
    expect(s.actualMin).toBe(45);
    expect(s.bestDay).toBe("2026-10-27");
  });
  it("has no best day when nothing was done", () => {
    expect(weekSummary([task({})], "me").bestDay).toBeNull();
  });
});

describe("projectedDayLoads", () => {
  it("adds assigned estimates on top of what each day already has", () => {
    const days = ["2026-11-02", "2026-11-03"];
    const loads = projectedDayLoads(
      days,
      new Map([["2026-11-02", 120]]),
      [
        { id: "a", time_estimate_min: 30 },
        { id: "b", time_estimate_min: null },
        { id: "c", time_estimate_min: 60 },
      ],
      { a: "2026-11-02", b: "2026-11-03", c: undefined },
    );
    expect(loads.get("2026-11-02")).toBe(150);
    expect(loads.get("2026-11-03")).toBe(0);
  });
});
