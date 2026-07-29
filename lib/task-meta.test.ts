import { describe, it, expect } from "vitest";
import { taskMetaVisibility, type Density } from "./task-meta";
import type { Task } from "./queries/types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Tarea",
    status: "todo",
    priority: "high",
    due_date: "2026-08-01",
    notes: "algo",
    objective_id: "o1",
    shared: true,
    time_estimate_min: 30,
    ...overrides,
  } as unknown as Task;
}

function visibility(overrides: {
  task?: Partial<Task>;
  subtaskCount?: number;
  hasAssignedBy?: boolean;
  timerRunning?: boolean;
  density?: Density;
}) {
  return taskMetaVisibility({
    task: task(overrides.task),
    subtaskCount: overrides.subtaskCount ?? 0,
    hasAssignedBy: overrides.hasAssignedBy ?? false,
    timerRunning: overrides.timerRunning ?? false,
    density: overrides.density ?? "comfortable",
  });
}

describe("taskMetaVisibility", () => {
  describe("compact (week columns)", () => {
    it("hides the checklist, move menu and delete button", () => {
      const v = visibility({ density: "compact", subtaskCount: 3 });
      expect(v.checklist).toBe(false);
      expect(v.moveMenu).toBe(false);
      expect(v.deleteButton).toBe(false);
    });

    it("still shows the subtask counter, which replaces the checklist", () => {
      const v = visibility({ density: "compact", subtaskCount: 3 });
      expect(v.subtaskCount).toBe(true);
    });

    it("switches to icon-only rendering", () => {
      expect(visibility({ density: "compact" }).iconOnly).toBe(true);
      expect(visibility({ density: "comfortable" }).iconOnly).toBe(false);
    });

    it("shows the stopwatch only while it is running", () => {
      expect(visibility({ density: "compact", timerRunning: false }).stopwatch).toBe(false);
      expect(visibility({ density: "compact", timerRunning: true }).stopwatch).toBe(true);
    });

    it("shows the estimate chip only when an estimate is set", () => {
      expect(visibility({ density: "compact", task: { time_estimate_min: null } }).estimate).toBe(
        false,
      );
      expect(visibility({ density: "compact", task: { time_estimate_min: 45 } }).estimate).toBe(
        true,
      );
    });
  });

  describe("comfortable (day view)", () => {
    it("always offers the stopwatch and estimate, since they reveal on hover", () => {
      const v = visibility({ task: { time_estimate_min: null }, timerRunning: false });
      expect(v.stopwatch).toBe(true);
      expect(v.estimate).toBe(true);
    });

    it("shows the checklist when there are subtasks", () => {
      expect(visibility({ subtaskCount: 2 }).checklist).toBe(true);
      expect(visibility({ subtaskCount: 0 }).checklist).toBe(false);
    });

    it("keeps the move menu and delete button", () => {
      const v = visibility({});
      expect(v.moveMenu).toBe(true);
      expect(v.deleteButton).toBe(true);
    });
  });

  describe("completed tasks", () => {
    it("drops priority and due date, which are no longer actionable", () => {
      const v = visibility({ task: { status: "done" } });
      expect(v.priority).toBe(false);
      expect(v.due).toBe(false);
    });

    it("keeps the channel so you can still tell what the task was", () => {
      expect(visibility({ task: { status: "done" } }).channel).toBe(true);
    });
  });

  describe("absent data", () => {
    it("hides priority when the task has none", () => {
      expect(visibility({ task: { priority: null } }).priority).toBe(false);
    });

    it("hides the due badge when there is no due date", () => {
      expect(visibility({ task: { due_date: null } }).due).toBe(false);
    });

    it("hides the note marker for null AND for an empty string", () => {
      expect(visibility({ task: { notes: null } }).note).toBe(false);
      expect(visibility({ task: { notes: "" } }).note).toBe(false);
      expect(visibility({ task: { notes: "x" } }).note).toBe(true);
    });

    it("hides the objective badge when unlinked", () => {
      expect(visibility({ task: { objective_id: null } }).objective).toBe(false);
    });

    it("hides the shared marker when not shared", () => {
      expect(visibility({ task: { shared: false } }).shared).toBe(false);
    });

    it("shows who assigned it only when someone did", () => {
      expect(visibility({ hasAssignedBy: false }).assignedBy).toBe(false);
      expect(visibility({ hasAssignedBy: true }).assignedBy).toBe(true);
    });
  });

  it("never shows the checklist and its counter as the only difference between densities", () => {
    // The counter is the compact stand-in for the list: with subtasks present,
    // exactly one of the two renders in compact, and both render comfortably.
    const compact = visibility({ density: "compact", subtaskCount: 4 });
    const comfortable = visibility({ density: "comfortable", subtaskCount: 4 });
    expect([compact.checklist, compact.subtaskCount]).toEqual([false, true]);
    expect([comfortable.checklist, comfortable.subtaskCount]).toEqual([true, true]);
  });
});
