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
    it("hides the move menu and delete button", () => {
      const v = visibility({ density: "compact", subtaskCount: 3 });
      expect(v.moveMenu).toBe(false);
      expect(v.deleteButton).toBe(false);
    });

    it("still shows the subtask counter, which is all the checklist ever is now", () => {
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

    it("shows the checklist meter only when there are subtasks", () => {
      expect(visibility({ subtaskCount: 2 }).subtaskCount).toBe(true);
      expect(visibility({ subtaskCount: 0 }).subtaskCount).toBe(false);
    });

    it("keeps the move menu and delete button", () => {
      const v = visibility({});
      expect(v.moveMenu).toBe(true);
      expect(v.deleteButton).toBe(true);
    });
  });

  describe("completed tasks", () => {
    it("drops the due date, which is no longer actionable", () => {
      expect(visibility({ task: { status: "done" } }).due).toBe(false);
    });

    it("keeps the channel so you can still tell what the task was", () => {
      expect(visibility({ task: { status: "done" } }).channel).toBe(true);
    });
  });

  describe("absent data", () => {
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

  it("shows the checklist meter in both densities — the card is two lines either way", () => {
    // The redesign dropped the inline item list, so the meter is the only
    // checklist representation and it must not differ between densities.
    expect(visibility({ density: "compact", subtaskCount: 4 }).subtaskCount).toBe(true);
    expect(visibility({ density: "comfortable", subtaskCount: 4 }).subtaskCount).toBe(true);
  });
});
