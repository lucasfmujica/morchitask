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
