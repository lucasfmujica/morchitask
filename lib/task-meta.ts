import type { Task } from "@/lib/queries/types";

/**
 * Which pieces of metadata a task card shows.
 *
 * Split out of the component because it's the part that needed to change and
 * the part worth testing. The card's old footer was a `flex-wrap` row of up to
 * nine chips — in a 320px week column it wrapped unpredictably, so every card
 * was a different height. The fix is twofold: the meta row never wraps, and in
 * a narrow column some things are demoted to an icon or dropped entirely.
 *
 * The redesign took that further: the card is exactly two lines in BOTH
 * densities, so the inline checklist is gone (it reads as three segments plus
 * `2/3` on the meta row, and its items are edited in the detail sheet) and the
 * priority pill is gone too — priority is the list's grouping, and repeating it
 * on every card inside its own group was pure noise.
 */

export type Density = "comfortable" | "compact";

export type MetaVisibility = {
  /** Title row */
  stopwatch: boolean;
  estimate: boolean;
  /** Meta row — identity cluster (elastic, left) */
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

    // A finished task's deadline stops being actionable — dropping it keeps
    // completed cards visually quiet.
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
