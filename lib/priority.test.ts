import { describe, it, expect } from "vitest";
import type { Task } from "@/lib/queries/types";
import {
  isTaskPriority,
  parsePriorityDropId,
  priorityDropId,
  priorityLabel,
  priorityRank,
  priorityRows,
  resolveTaskDrop,
  sortByPriority,
  type PriorityKey,
} from "./priority";

/** Minimal task — only the fields the ordering and drop logic read. */
function t(id: string, priority: PriorityKey, sort_order: number, status = "todo"): Task {
  return { id, priority, sort_order, status } as Task;
}

describe("priorityRank", () => {
  it("orders Alta → Media → Baja → sin prioridad", () => {
    expect(priorityRank("high")).toBeLessThan(priorityRank("medium"));
    expect(priorityRank("medium")).toBeLessThan(priorityRank("low"));
    expect(priorityRank("low")).toBeLessThan(priorityRank(null));
  });
});

describe("priorityLabel", () => {
  it("labels every slot in Spanish", () => {
    expect(priorityLabel("high")).toBe("Alta");
    expect(priorityLabel("medium")).toBe("Media");
    expect(priorityLabel("low")).toBe("Baja");
    expect(priorityLabel(null)).toBe("Sin prioridad");
  });
});

describe("isTaskPriority", () => {
  it("accepts only the three levels", () => {
    expect(isTaskPriority("high")).toBe(true);
    expect(isTaskPriority("low")).toBe(true);
    expect(isTaskPriority(null)).toBe(false);
    expect(isTaskPriority("urgent")).toBe(false);
    expect(isTaskPriority(1)).toBe(false);
  });
});

describe("sortByPriority", () => {
  it("groups Alta → Media → Baja → sin prioridad", () => {
    const none = t("none", null, 1000);
    const low = t("low", "low", 1000);
    const high = t("high", "high", 1000);
    const med = t("med", "medium", 1000);
    expect(sortByPriority([none, low, high, med])).toEqual([high, med, low, none]);
  });

  it("keeps the manual order inside a group (stable)", () => {
    const a = t("a", "high", 1000);
    const b = t("b", "high", 2000);
    const c = t("c", null, 500);
    expect(sortByPriority([a, b, c])).toEqual([a, b, c]);
    expect(sortByPriority([c, a, b])).toEqual([a, b, c]);
  });

  it("returns the same reference when already grouped", () => {
    const all = [t("a", "high", 1000), t("b", "low", 1000), t("c", null, 1000)];
    expect(sortByPriority(all)).toBe(all); // no needless copy → useMemo stays stable
  });

  it("handles an empty list", () => {
    expect(sortByPriority([])).toEqual([]);
  });
});

describe("priorityRows", () => {
  it("renders no headers when everything shares one group", () => {
    const tasks = [t("a", null, 1000), t("b", null, 2000)];
    expect(priorityRows(tasks)).toEqual([
      { kind: "task", task: tasks[0] },
      { kind: "task", task: tasks[1] },
    ]);
  });

  it("puts a header above each populated group", () => {
    const high = t("h", "high", 1000);
    const none = t("n", null, 1000);
    const rows = priorityRows([high, none]);
    expect(rows).toEqual([
      { kind: "header", priority: "high", count: 1, empty: false },
      { kind: "task", task: high },
      { kind: "header", priority: null, count: 1, empty: false },
      { kind: "task", task: none },
    ]);
  });

  it("adds strips for missing groups while dragging", () => {
    const rows = priorityRows([t("a", null, 1000)], { includeEmpty: true });
    const strips = rows.flatMap((r) => (r.kind === "header" && r.empty ? [r.priority] : []));
    expect(strips).toEqual(["high", "medium", "low"]);
  });

  it("handles an empty list", () => {
    expect(priorityRows([])).toEqual([]);
    expect(priorityRows([], { includeEmpty: true })).toHaveLength(4); // all four strips
  });
});

describe("priorityDropId / parsePriorityDropId", () => {
  it("round-trips every slot with an ISO-date scope", () => {
    for (const p of ["high", "medium", "low", null] as PriorityKey[]) {
      const id = priorityDropId("2026-07-28", p);
      expect(parsePriorityDropId(id)).toEqual({ scope: "2026-07-28", priority: p });
    }
  });

  it("round-trips a non-date scope", () => {
    expect(parsePriorityDropId(priorityDropId("backlog", "high"))).toEqual({
      scope: "backlog",
      priority: "high",
    });
  });

  it("rejects ids that aren't group droppables", () => {
    expect(parsePriorityDropId("day-2026-07-28")).toBeNull();
    expect(parsePriorityDropId("slot-9")).toBeNull();
    expect(parsePriorityDropId("prio::2026-07-28::urgent")).toBeNull();
  });
});

describe("resolveTaskDrop", () => {
  const a = t("a", "high", 1000);
  const b = t("b", "high", 2000);
  const c = t("c", "medium", 1000);
  const d = t("d", "medium", 2000);
  const ordered = [a, b, c, d];

  it("reorders within a group, dragging down", () => {
    // c dropped onto d → lands after d, still medium
    expect(resolveTaskDrop(ordered, c, { kind: "task", task: d })).toEqual({
      priority: "medium",
      sortOrder: 3000, // orderBetween(2000, null)
    });
  });

  it("reorders within a group, dragging up", () => {
    expect(resolveTaskDrop(ordered, b, { kind: "task", task: a })).toEqual({
      priority: "high",
      sortOrder: 0, // orderBetween(null, 1000)
    });
  });

  it("adopts the hovered card's priority when crossing groups downward", () => {
    // a (high) dropped onto c (medium) → after c, before d
    expect(resolveTaskDrop(ordered, a, { kind: "task", task: c })).toEqual({
      priority: "medium",
      sortOrder: 1500,
    });
  });

  it("adopts the hovered card's priority when crossing groups upward", () => {
    // d (medium) dropped onto b (high) → before b, after a
    expect(resolveTaskDrop(ordered, d, { kind: "task", task: b })).toEqual({
      priority: "high",
      sortOrder: 1500,
    });
  });

  it("handles the very top of the list", () => {
    expect(resolveTaskDrop(ordered, d, { kind: "task", task: a })).toEqual({
      priority: "high",
      sortOrder: 0,
    });
  });

  it("handles the very bottom of the list", () => {
    expect(resolveTaskDrop(ordered, a, { kind: "task", task: d })).toEqual({
      priority: "medium",
      sortOrder: 3000,
    });
  });

  it("never anchors on a neighbour from another group", () => {
    // The regression this whole design exists for: the Alta task carries a much
    // larger sort_order than the Media ones. Anchoring on it would put C after B
    // instead of before it.
    const high = t("high", "high", 9000);
    const m1 = t("m1", "medium", 3000);
    const m2 = t("m2", "medium", 4000);
    const list = [high, m1, m2];
    const drop = resolveTaskDrop(list, m2, { kind: "task", task: m1 });
    expect(drop).toEqual({ priority: "medium", sortOrder: 2000 }); // orderBetween(null, 3000)
    expect(drop!.sortOrder).toBeLessThan(m1.sort_order); // lands BEFORE m1, as dropped
  });

  it("drops into an empty group past every existing value", () => {
    const drop = resolveTaskDrop(ordered, a, { kind: "group", priority: "low" });
    expect(drop!.priority).toBe("low");
    // orderForAppend over the remaining tasks — no tie with a neighbouring group
    expect(drop!.sortOrder).toBeGreaterThan(2000);
  });

  it("puts a group-header drop at the top of that group", () => {
    expect(resolveTaskDrop(ordered, d, { kind: "group", priority: "high" })).toEqual({
      priority: "high",
      sortOrder: 0, // before a
    });
  });

  it("keeps the task's own priority on a bare list/background drop", () => {
    // Week: dropped on the column background of another day.
    const otherDay = [t("x", "high", 1000), t("y", "medium", 1000)];
    const dragged = t("dragged", "medium", 500);
    expect(resolveTaskDrop(otherDay, dragged, { kind: "list" })).toEqual({
      priority: "medium",
      sortOrder: 2000, // end of that day's medium group
    });
  });

  it("appends to the end when the task's own group is missing in the target day", () => {
    const otherDay = [t("x", "high", 1000)];
    const dragged = t("dragged", "low", 500);
    const drop = resolveTaskDrop(otherDay, dragged, { kind: "list" });
    expect(drop!.priority).toBe("low");
    expect(drop!.sortOrder).toBe(2000); // orderForAppend([1000])
  });

  it("inserts before the hovered card when arriving from another day", () => {
    // `active` is absent from `ordered` — the cross-day case.
    const dragged = t("dragged", null, 500);
    expect(resolveTaskDrop(ordered, dragged, { kind: "task", task: d })).toEqual({
      priority: "medium",
      sortOrder: 1500, // between c and d
    });
  });

  it("returns null when nothing would change", () => {
    expect(resolveTaskDrop(ordered, a, { kind: "task", task: a })).toBeNull();
    // b dropped on itself via a stale id
    expect(resolveTaskDrop(ordered, b, { kind: "task", task: t("ghost", "high", 1) })).toBeNull();
  });
});
