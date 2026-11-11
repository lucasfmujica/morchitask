import { describe, expect, it } from "vitest";
import { isNoop, replanFromNow, roundUpTo, type ReplanItem } from "./replan";

const h = (hours: number) => Math.round(hours * 60);

function item(over: Partial<ReplanItem> & { taskId: string }): ReplanItem {
  return {
    blockId: `b-${over.taskId}`,
    durMin: 60,
    fromStartMin: null,
    priority: null,
    sortOrder: 0,
    ...over,
  };
}

describe("roundUpTo", () => {
  it("rounds up to the next quarter hour", () => {
    expect(roundUpTo(h(14) + 7)).toBe(h(14.25));
    expect(roundUpTo(h(14))).toBe(h(14));
  });
});

describe("replanFromNow", () => {
  it("packs late work from now around a fixed meeting, and spills what doesn't fit", () => {
    // The canvas example: 14:15 → 19:00 with a 16:00–16:30 meeting.
    const res = replanFromNow({
      fromMin: h(14.25),
      toMin: h(19),
      fixed: [{ startMin: h(16), endMin: h(16.5) }],
      items: [
        item({ taskId: "brief", durMin: 45, fromStartMin: h(12) }),
        item({ taskId: "super", durMin: 60, fromStartMin: h(13.5) }),
        item({ taskId: "home", blockId: null, durMin: 60 }),
        item({ taskId: "correr", durMin: 60, fromStartMin: h(15) }),
        item({ taskId: "facturar", blockId: null, durMin: 60, sortOrder: 9 }),
      ],
    });

    expect(res.moves.map((m) => [m.taskId, m.startMin])).toEqual([
      ["brief", h(14.25)],
      ["super", h(15)],
      ["correr", h(16.5)],
      ["home", h(17.5)],
    ]);
    expect(res.overflow.map((o) => o.taskId)).toEqual(["facturar"]);
    expect(res.freeMin).toBe(h(4.25));
    expect(res.neededMin).toBe(285);
  });

  it("puts higher priority first even if it was planned later", () => {
    const res = replanFromNow({
      fromMin: h(10),
      toMin: h(11),
      fixed: [],
      items: [
        item({ taskId: "low", durMin: 60, fromStartMin: h(8), priority: "low" }),
        item({ taskId: "high", durMin: 60, fromStartMin: h(15), priority: "high" }),
      ],
    });
    expect(res.moves.map((m) => m.taskId)).toEqual(["high"]);
    expect(res.overflow.map((o) => o.taskId)).toEqual(["low"]);
  });

  it("never splits an item: a smaller one later can still use an earlier gap", () => {
    const res = replanFromNow({
      fromMin: h(9),
      toMin: h(12),
      fixed: [{ startMin: h(9.5), endMin: h(10) }],
      items: [
        item({ taskId: "long", durMin: 90, fromStartMin: h(8) }),
        item({ taskId: "short", durMin: 30, fromStartMin: h(8.5) }),
      ],
    });
    expect(res.moves.map((m) => [m.taskId, m.startMin])).toEqual([
      ["short", h(9)],
      ["long", h(10)],
    ]);
  });

  it("returns nothing to move and the whole window free when there's no work", () => {
    const res = replanFromNow({ fromMin: h(18), toMin: h(19), fixed: [], items: [] });
    expect(res).toEqual({ moves: [], overflow: [], freeMin: 60, neededMin: 0 });
  });

  it("overflows everything when now is already past the end of the day", () => {
    const res = replanFromNow({
      fromMin: h(20),
      toMin: h(19),
      fixed: [],
      items: [item({ taskId: "a", durMin: 30 })],
    });
    expect(res.moves).toEqual([]);
    expect(res.overflow.map((o) => o.taskId)).toEqual(["a"]);
    expect(res.freeMin).toBe(0);
  });

  it("ignores zero-length items", () => {
    const res = replanFromNow({
      fromMin: h(9),
      toMin: h(10),
      fixed: [],
      items: [item({ taskId: "z", durMin: 0 })],
    });
    expect(res.moves).toEqual([]);
    expect(res.overflow).toEqual([]);
  });
});

describe("isNoop", () => {
  it("is true only for an existing block that lands where it already was", () => {
    expect(isNoop({ ...item({ taskId: "a", fromStartMin: 600 }), startMin: 600 })).toBe(true);
    expect(isNoop({ ...item({ taskId: "a", fromStartMin: 600 }), startMin: 660 })).toBe(false);
    expect(isNoop({ ...item({ taskId: "a", blockId: null }), startMin: 600 })).toBe(false);
  });
});
