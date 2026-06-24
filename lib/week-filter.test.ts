import { describe, it, expect } from "vitest";
import type { Task } from "@/lib/queries/types";
import { completionPct, filterTasksByChannels, sortDoneLast } from "./week-filter";

/** Minimal task factory — only the field the filter reads. */
function task(channel_id: string | null): Task {
  return { id: channel_id ?? "none", channel_id } as Task;
}

/** Minimal task with an id + status, for the done-last ordering. */
function statusTask(id: string, status: "todo" | "done"): Task {
  return { id, status } as Task;
}

describe("filterTasksByChannels", () => {
  const a = task("ch-a");
  const b = task("ch-b");
  const none = task(null);
  const tasks = [a, b, none];

  it("returns everything when the set is empty (Todas)", () => {
    expect(filterTasksByChannels(tasks, new Set())).toEqual(tasks);
  });

  it("keeps only tasks of the selected channel", () => {
    expect(filterTasksByChannels(tasks, new Set(["ch-a"]))).toEqual([a]);
  });

  it("hides uncategorized tasks when a filter is active", () => {
    expect(filterTasksByChannels(tasks, new Set(["ch-a"]))).not.toContain(none);
  });

  it("unions multiple selected channels", () => {
    expect(filterTasksByChannels(tasks, new Set(["ch-a", "ch-b"]))).toEqual([a, b]);
  });

  it("includes uncategorized tasks only when the set is empty", () => {
    expect(filterTasksByChannels(tasks, new Set())).toContain(none);
  });
});

describe("sortDoneLast", () => {
  it("moves done tasks to the bottom, keeping each group's order", () => {
    const a = statusTask("a", "todo");
    const b = statusTask("b", "done");
    const c = statusTask("c", "todo");
    const d = statusTask("d", "done");
    expect(sortDoneLast([a, b, c, d])).toEqual([a, c, b, d]);
  });
  it("returns the list unchanged when all share a status", () => {
    const a = statusTask("a", "todo");
    const b = statusTask("b", "todo");
    const all = [a, b];
    expect(sortDoneLast(all)).toBe(all); // same reference, no needless copy
  });
  it("handles an empty list", () => {
    expect(sortDoneLast([])).toEqual([]);
  });
});

describe("completionPct", () => {
  it("is 0 when there are no tasks", () => {
    expect(completionPct(0, 0)).toBe(0);
  });
  it("is 100 when all are done", () => {
    expect(completionPct(4, 4)).toBe(100);
  });
  it("rounds to the nearest integer", () => {
    expect(completionPct(1, 3)).toBe(33);
    expect(completionPct(2, 3)).toBe(67);
  });
});
