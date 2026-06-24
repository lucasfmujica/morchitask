import type { AnalyticsTask } from "@/lib/queries/tasks";
import type { DayISO } from "@/lib/date";

/**
 * Pure aggregations for the historical analytics in Resumen. They take the
 * lightweight `AnalyticsTask` rows from `tasksInRangeQueryOptions` and reduce
 * them — no fetching, no dates math here, so they're trivially testable.
 */

export type Completion = { total: number; done: number };

/** Tasks whose `planned_date` falls inside the given day set. */
export function filterByDays(
  tasks: readonly AnalyticsTask[],
  days: ReadonlySet<DayISO>,
): AnalyticsTask[] {
  return tasks.filter((t) => t.planned_date != null && days.has(t.planned_date));
}

/** Completed vs total count. */
export function completion(tasks: readonly AnalyticsTask[]): Completion {
  return {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
  };
}

/** Completion as a 0–1 ratio (0 when there are no tasks). */
export function completionRate(c: Completion): number {
  return c.total === 0 ? 0 : c.done / c.total;
}

export type EstimateAccuracy = { estimatedMin: number; actualMin: number; trackedCount: number };

/**
 * Estimated vs actually-tracked time, over tasks that have a tracked time —
 * the only ones where the comparison is meaningful.
 */
export function estimatedVsActual(tasks: readonly AnalyticsTask[]): EstimateAccuracy {
  let estimatedMin = 0;
  let actualMin = 0;
  let trackedCount = 0;
  for (const t of tasks) {
    if (t.actual_time_min == null || t.actual_time_min <= 0) continue;
    trackedCount++;
    actualMin += t.actual_time_min;
    estimatedMin += t.time_estimate_min ?? 0;
  }
  return { estimatedMin, actualMin, trackedCount };
}

/** Planned minutes per channel id ("none" for uncategorised). */
export function minutesByChannel(tasks: readonly AnalyticsTask[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tasks) {
    const key = t.channel_id ?? "none";
    map.set(key, (map.get(key) ?? 0) + (t.time_estimate_min ?? 0));
  }
  return map;
}

export type OwnerStat = { total: number; done: number; plannedMin: number };

/** Per-owner totals, keyed by `owner_id`. */
export function ownerStats(tasks: readonly AnalyticsTask[]): Map<string, OwnerStat> {
  const map = new Map<string, OwnerStat>();
  for (const t of tasks) {
    const key = t.owner_id;
    const entry = map.get(key) ?? { total: 0, done: 0, plannedMin: 0 };
    entry.total += 1;
    if (t.status === "done") entry.done += 1;
    entry.plannedMin += t.time_estimate_min ?? 0;
    map.set(key, entry);
  }
  return map;
}
