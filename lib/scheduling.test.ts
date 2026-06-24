import { describe, it, expect } from "vitest";
import {
  blockDurationMin,
  nextBlockDurationMin,
  remainingMin,
  scheduledMin,
  showInUnscheduled,
} from "./scheduling";

const block = (startISO: string, endISO: string) => ({ start_at: startISO, end_at: endISO });
// 09:00–10:00 and 16:00–16:30 on the same day (UTC for simplicity).
const oneHour = block("2026-06-24T09:00:00.000Z", "2026-06-24T10:00:00.000Z");
const halfHour = block("2026-06-24T16:00:00.000Z", "2026-06-24T16:30:00.000Z");

describe("blockDurationMin", () => {
  it("measures end − start in minutes", () => {
    expect(blockDurationMin(oneHour)).toBe(60);
    expect(blockDurationMin(halfHour)).toBe(30);
  });
});

describe("scheduledMin", () => {
  it("sums every block", () => {
    expect(scheduledMin([oneHour, halfHour])).toBe(90);
    expect(scheduledMin([])).toBe(0);
  });
});

describe("remainingMin", () => {
  it("is estimate minus scheduled", () => {
    expect(remainingMin(120, [oneHour])).toBe(60); // 2h task, 1h placed → 1h left
    expect(remainingMin(120, [oneHour, oneHour])).toBe(0);
  });
  it("never goes negative", () => {
    expect(remainingMin(60, [oneHour, halfHour])).toBe(0);
  });
  it("is null without an estimate", () => {
    expect(remainingMin(null, [oneHour])).toBeNull();
  });
});

describe("showInUnscheduled", () => {
  it("always shows a never-scheduled task", () => {
    expect(showInUnscheduled(null, [])).toBe(true);
    expect(showInUnscheduled(120, [])).toBe(true);
  });
  it("keeps showing while meaningful time remains", () => {
    expect(showInUnscheduled(120, [oneHour])).toBe(true); // 1h left
  });
  it("hides once fully scheduled", () => {
    expect(showInUnscheduled(120, [oneHour, oneHour])).toBe(false);
  });
  it("hides a tiny leftover sliver", () => {
    expect(showInUnscheduled(70, [oneHour])).toBe(false); // 10m left < 15m
  });
  it("hides an estimate-less task once it has any block", () => {
    expect(showInUnscheduled(null, [halfHour])).toBe(false);
  });
});

describe("nextBlockDurationMin", () => {
  it("uses the remaining time when there's room", () => {
    expect(nextBlockDurationMin(120, [oneHour])).toBe(60);
  });
  it("uses the full estimate for the first block", () => {
    expect(nextBlockDurationMin(90, [])).toBe(90);
  });
  it("falls back when no estimate", () => {
    expect(nextBlockDurationMin(null, [])).toBe(30);
    expect(nextBlockDurationMin(null, [], 45)).toBe(45);
  });
  it("uses the estimate for an extra session once fully scheduled", () => {
    // (In practice a fully-scheduled task leaves the list, so this is just the
    //  coherent fallback: a full estimate-sized session.)
    expect(nextBlockDurationMin(60, [oneHour])).toBe(60);
  });
});
