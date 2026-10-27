import { describe, expect, it } from "vitest";
import {
  BREAKDOWN_MAX_ITEMS,
  PlanInput,
  cleanBreakdown,
  consumeQuota,
  parseClock,
  validatePlan,
  type PlanOutput,
} from "./ai-proposals";

describe("cleanBreakdown", () => {
  it("trims, strips list markers and collapses spaces", () => {
    expect(cleanBreakdown(["  1. Llamar  al  banco ", "- Pedir turno", "• Ir"])).toEqual([
      "Llamar al banco",
      "Pedir turno",
      "Ir",
    ]);
  });

  it("drops blanks, duplicates and items already on the checklist", () => {
    expect(
      cleanBreakdown(["Comprar pintura", "", "comprar pintura", "Lijar", "Pintar"], ["LIJAR"]),
    ).toEqual(["Comprar pintura", "Pintar"]);
  });

  it("caps the number of items and their length", () => {
    const many = Array.from({ length: 12 }, (_, i) => `Paso ${i} ${"x".repeat(200)}`);
    const out = cleanBreakdown(many);
    expect(out).toHaveLength(BREAKDOWN_MAX_ITEMS);
    expect(out.every((t) => t.length <= 120)).toBe(true);
  });
});

describe("parseClock", () => {
  it("parses valid times and rejects junk", () => {
    expect(parseClock("09:30")).toBe(570);
    expect(parseClock("9:05")).toBe(545);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("10:60")).toBeNull();
    expect(parseClock("mediodía")).toBeNull();
  });
});

const tasks = [
  { id: "a", remainingMin: 60 },
  { id: "b", remainingMin: 30 },
  { id: "c", remainingMin: 90 },
];
const ctx = { tasks, busy: [], fromMin: 540, toMin: 1080, capacityLeftMin: 600 };
const out = (blocks: PlanOutput["blocks"], note = "Primero lo difícil.") => ({ blocks, note });

/** No two ranges overlap, and every range stays within [from, to). */
function assertNoOverlap(
  ranges: { startMin: number; endMin: number }[],
  fromMin: number,
  toMin: number,
) {
  const sorted = [...ranges].sort((x, y) => x.startMin - y.startMin);
  for (let i = 0; i < sorted.length; i++) {
    expect(sorted[i].startMin).toBeGreaterThanOrEqual(fromMin);
    expect(sorted[i].endMin).toBeLessThanOrEqual(toMin);
    if (i > 0) expect(sorted[i].startMin).toBeGreaterThanOrEqual(sorted[i - 1].endMin);
  }
}

describe("validatePlan", () => {
  it("keeps a clean proposal as-is, sorted by start", () => {
    const res = validatePlan(
      out([
        { task: 1, start: "11:00", durationMin: 30 },
        { task: 0, start: "09:00", durationMin: 60 },
      ]),
      ctx,
    );
    expect(res.blocks).toEqual([
      { taskId: "a", startMin: 540, endMin: 600 },
      { taskId: "b", startMin: 660, endMin: 690 },
    ]);
    expect(res.skippedTaskIds).toEqual([]);
    expect(res.note).toBe("Primero lo difícil.");
  });

  it("drops unknown indexes and repeated tasks", () => {
    const res = validatePlan(
      out([
        { task: 7, start: "09:00", durationMin: 30 },
        { task: -1, start: "09:00", durationMin: 30 },
        { task: 1, start: "09:00", durationMin: 30 },
        { task: 1, start: "12:00", durationMin: 30 },
      ]),
      ctx,
    );
    expect(res.blocks.map((b) => b.taskId)).toEqual(["b"]);
  });

  it("clamps durations to [15, remaining] and snaps to 5 minutes", () => {
    const res = validatePlan(
      out([
        { task: 1, start: "09:00", durationMin: 240 }, // more than remaining 30
        { task: 0, start: "10:00", durationMin: 3 }, // below the minimum
        { task: 2, start: "11:00", durationMin: 47 },
      ]),
      ctx,
    );
    expect(res.blocks.map((b) => b.endMin - b.startMin)).toEqual([30, 15, 45]);
  });

  it("slides a block off existing busy time and off other proposed blocks", () => {
    const res = validatePlan(
      out([
        { task: 0, start: "09:00", durationMin: 60 },
        { task: 1, start: "09:30", durationMin: 30 }, // overlaps task 0
        { task: 2, start: "10:00", durationMin: 90 }, // overlaps a meeting at 10–11
      ]),
      { ...ctx, busy: [{ startMin: 600, endMin: 660 }] },
    );
    expect(res.blocks).toEqual([
      { taskId: "a", startMin: 540, endMin: 600 },
      { taskId: "b", startMin: 660, endMin: 690 },
      { taskId: "c", startMin: 690, endMin: 780 },
    ]);
    assertNoOverlap([...res.blocks, { startMin: 600, endMin: 660 }], 540, 1080);
  });

  it("respects the window: before fromMin and after toMin", () => {
    const res = validatePlan(
      out([
        { task: 0, start: "07:00", durationMin: 60 }, // before the window
        { task: 1, start: "17:50", durationMin: 30 }, // would end past 18:00
      ]),
      { ...ctx, fromMin: 600, toMin: 1080 },
    );
    expect(res.blocks).toEqual([
      { taskId: "a", startMin: 600, endMin: 660 },
      { taskId: "b", startMin: 660, endMin: 690 },
    ]);
  });

  it("falls back to an invalid start's first opening", () => {
    const res = validatePlan(out([{ task: 0, start: "por la tarde", durationMin: 60 }]), {
      ...ctx,
      busy: [{ startMin: 540, endMin: 600 }],
    });
    expect(res.blocks).toEqual([{ taskId: "a", startMin: 600, endMin: 660 }]);
  });

  it("skips what doesn't fit anywhere", () => {
    const res = validatePlan(
      out([
        { task: 0, start: "09:00", durationMin: 60 },
        { task: 2, start: "10:00", durationMin: 90 },
      ]),
      { ...ctx, toMin: 660 }, // 2h window: a fits, c (90m) doesn't after it
    );
    expect(res.blocks.map((b) => b.taskId)).toEqual(["a"]);
    expect(res.skippedTaskIds).toEqual(["c"]);
  });

  it("stops at the capacity left, shortening the last block if it's still useful", () => {
    const res = validatePlan(
      out([
        { task: 0, start: "09:00", durationMin: 60 },
        { task: 2, start: "10:00", durationMin: 90 },
        { task: 1, start: "13:00", durationMin: 30 },
      ]),
      { ...ctx, capacityLeftMin: 100 },
    );
    expect(res.blocks.map((b) => [b.taskId, b.endMin - b.startMin])).toEqual([
      ["a", 60],
      ["c", 40],
    ]);
    expect(res.skippedTaskIds).toEqual(["b"]);
  });

  it("never overlaps on a messy proposal", () => {
    const busy = [
      { startMin: 570, endMin: 630 },
      { startMin: 720, endMin: 780 },
    ];
    const res = validatePlan(
      out([
        { task: 2, start: "09:15", durationMin: 90 },
        { task: 0, start: "09:15", durationMin: 60 },
        { task: 1, start: "12:10", durationMin: 30 },
      ]),
      { ...ctx, busy },
    );
    assertNoOverlap([...res.blocks, ...busy], 540, 1080);
    expect(res.blocks).toHaveLength(3);
  });
});

describe("PlanInput", () => {
  it("rejects oversized or out-of-range requests", () => {
    const base = { date: "2026-10-27", tasks: [], busy: [], fromMin: 540, toMin: 1080 };
    expect(PlanInput.safeParse({ ...base, capacityLeftMin: 300 }).success).toBe(true);
    expect(PlanInput.safeParse({ ...base, capacityLeftMin: 300, toMin: 5000 }).success).toBe(false);
    const tooMany = Array.from({ length: 41 }, (_, i) => ({
      id: String(i),
      title: "t",
      remainingMin: 30,
    }));
    expect(PlanInput.safeParse({ ...base, capacityLeftMin: 300, tasks: tooMany }).success).toBe(
      false,
    );
  });
});

describe("consumeQuota", () => {
  it("counts per key until the limit", () => {
    const store = new Map<string, number>();
    expect(consumeQuota(store, "lucas:2026-10-27", 2)).toBe(true);
    expect(consumeQuota(store, "lucas:2026-10-27", 2)).toBe(true);
    expect(consumeQuota(store, "lucas:2026-10-27", 2)).toBe(false);
    // Another person, or tomorrow, starts fresh.
    expect(consumeQuota(store, "sofi:2026-10-27", 2)).toBe(true);
    expect(consumeQuota(store, "lucas:2026-10-28", 2)).toBe(true);
  });
});
