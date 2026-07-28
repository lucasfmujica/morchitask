import { sortByPriority } from "@/lib/priority";
import type { Task } from "@/lib/queries/types";

/**
 * Filter a day's tasks by the set of selected channel (category) ids.
 *
 * Convention: an empty set means "Todas" — show everything. When a specific
 * set of channels is selected, uncategorized tasks (channel_id === null) are
 * hidden. Pure so it can be unit-tested and shared by the Week view's columns,
 * progress bars and counts.
 */
export function filterTasksByChannels(tasks: Task[], selected: Set<string>): Task[] {
  if (selected.size === 0) return tasks;
  return tasks.filter((t) => t.channel_id != null && selected.has(t.channel_id));
}

/** Completion as a 0–100 integer percentage. Returns 0 when there are no tasks. */
export function completionPct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

/**
 * Move completed tasks to the bottom, keeping each group's existing order.
 * Display-only (doesn't touch sort_order) so finishing a task sinks it to the
 * end and un-checking it pops it back to where it was. Stable partition.
 */
export function sortDoneLast(tasks: Task[]): Task[] {
  const open: Task[] = [];
  const done: Task[] = [];
  for (const t of tasks) (t.status === "done" ? done : open).push(t);
  return open.length === 0 || done.length === 0 ? tasks : [...open, ...done];
}

/**
 * The list a day actually renders: category filter → completed sunk to the
 * bottom → regrouped by priority. Shared by Today and Week so the two views
 * can never drift apart.
 *
 * Priority grouping runs LAST on purpose: each group ends up a contiguous run
 * with its own open-then-done ordering, and that contiguity is the invariant
 * `resolveTaskDrop` relies on to know when a neighbour belongs to another group.
 */
export function orderTasksForDisplay(tasks: Task[], selected: Set<string>): Task[] {
  return sortByPriority(sortDoneLast(filterTasksByChannels(tasks, selected)));
}
