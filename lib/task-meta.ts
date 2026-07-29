import type { Task } from "@/lib/queries/types";

/**
 * Which pieces of metadata a task card shows.
 *
 * Split out of the component because it's the part that needed to change and
 * the part worth testing. The card's old footer was a `flex-wrap` row of up to
 * nine chips — in a 320px week column it wrapped unpredictably, so every card
 * was a different height. The fix is twofold: the meta row never wraps, and in
 * a narrow column some things are demoted to an icon or dropped entirely.
 */

export type Density = "comfortable" | "compact";

export type MetaVisibility = {
  /** Title row */
  stopwatch: boolean;
  estimate: boolean;
  /** Card body */
  checklist: boolean;
  /** Meta row — identity cluster (elastic, left) */
  priority: boolean;
  channel: boolean;
  due: boolean;
  /** Meta row — affordance cluster (fixed, right) */
  subtaskCount: boolean;
  note: boolean;
  objective: boolean;
  shared: boolean;
  assignedBy: boolean;
  moveMenu: boolean;
  deleteButton: boolean;
  /** Render words as icons, so the row fits a narrow column. */
  iconOnly: boolean;
};

/**
 * `compact` is the week column (320px wide). What it drops and why:
 *
 * - checklist → the `3/5` counter already carries the information
 * - stopwatch/estimate → only when they hold state; the hover-to-reveal
 *   affordances belong in the day view where there's room
 * - move-to-day menu → dragging the card to another column does the same thing
 * - delete → still available by opening the task
 *
 * The result is deterministically two rows, so cards in a column all match.
 */
export function taskMetaVisibility(input: {
  task: Task;
  subtaskCount: number;
  hasAssignedBy: boolean;
  timerRunning: boolean;
  density: Density;
}): MetaVisibility {
  const { task, subtaskCount, hasAssignedBy, timerRunning, density } = input;
  const compact = density === "compact";
  const done = task.status === "done";

  return {
    // Comfortable always renders the control (idle ones fade in on hover);
    // compact only renders it when it's actually carrying state.
    stopwatch: compact ? timerRunning : true,
    estimate: compact ? task.time_estimate_min != null : true,

    checklist: subtaskCount > 0 && !compact,

    // A finished task's priority and deadline stop being actionable — dropping
    // them keeps completed cards visually quiet.
    priority: !done && task.priority != null,
    channel: true,
    due: !done && task.due_date != null,

    subtaskCount: subtaskCount > 0,
    note: task.notes != null && task.notes !== "",
    objective: task.objective_id != null,
    shared: task.shared,
    assignedBy: hasAssignedBy,
    moveMenu: !compact,
    deleteButton: !compact,

    iconOnly: compact,
  };
}
