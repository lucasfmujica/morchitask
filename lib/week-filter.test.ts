import { describe, it, expect } from "vitest";
import type { Task } from "@/lib/queries/types";
import { completionPct, filterTasksByChannels } from "./week-filter";

/** Minimal task factory — only the field the filter reads. */
function task(channel_id: string | null): Task {
  return { id: channel_id ?? "none", channel_id } as Task;
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
