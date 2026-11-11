import type { AnalyticsTask, TrackedTask } from "@/lib/queries/tasks";
import type { DayISO } from "@/lib/date";
import { canHaveWorked, WORK_GOAL_MIN, workedState } from "@/lib/worked";

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

export type OwnerStat = { total: number; done: number };

/**
 * Per-owner task counts, keyed by `owner_id`. Counts only, no time: tracked
 * hours are personal, so Resumen never puts a partner's hours on screen, and
 * estimated hours said nothing for whoever doesn't estimate.
 */
export function ownerStats(tasks: readonly AnalyticsTask[]): Map<string, OwnerStat> {
  const map = new Map<string, OwnerStat>();
  for (const t of tasks) {
    const key = t.owner_id;
    const entry = map.get(key) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (t.status === "done") entry.done += 1;
    map.set(key, entry);
  }
  return map;
}

// ------------------------------------------------------------ worked time
//
// Resumen leads with what was WORKED, not what was planned. One of the two
// people barely plans or estimates but tracks everything, and every card built
// on estimates (planned time, time by category, estimate vs actual) sat empty
// for her. These read the per-day time entries instead.

export type WorkedSummary = {
  /** Minutes tracked on the period's days up to today. */
  workedMin: number;
  /** The daily goal times the days that could have been worked. */
  goalMin: number;
  /** Days in the period up to and including today. */
  elapsedDays: number;
  /** Elapsed days whose tracked time reached the daily goal. */
  daysReached: number;
  /** Fill of the ring, 0–100, capped. */
  pct: number;
};

/**
 * Worked time over a period against its goal. Future days don't count towards
 * the goal: on a Tuesday, "this week" is two days of 5h, not seven, or the ring
 * would read as failing every week until Sunday.
 */
export function workedSummary(
  byDay: ReadonlyMap<string, number>,
  days: Iterable<DayISO>,
  today: DayISO,
  dailyGoalMin: number = WORK_GOAL_MIN,
): WorkedSummary {
  let workedMin = 0;
  let elapsedDays = 0;
  let daysReached = 0;
  for (const day of days) {
    if (!canHaveWorked(day, today)) continue;
    elapsedDays++;
    const min = byDay.get(day) ?? 0;
    workedMin += min;
    if (workedState(min, dailyGoalMin).reached) daysReached++;
  }
  const goalMin = elapsedDays * dailyGoalMin;
  return { workedMin, goalMin, elapsedDays, daysReached, pct: workedState(workedMin, goalMin).pct };
}

/** The day with the most worked time; ties go to the first. Undefined when none was worked. */
export function bestWorkedDay(
  byDay: ReadonlyMap<string, number>,
  days: readonly DayISO[],
): DayISO | undefined {
  let best: DayISO | undefined;
  let bestMin = 0;
  for (const day of days) {
    const min = byDay.get(day) ?? 0;
    if (min > bestMin) {
      best = day;
      bestMin = min;
    }
  }
  return best;
}

export type CategoryMinutes = {
  /** The channel id, or "none" for tasks without a category. */
  id: string;
  /** Null for "none": the caller names it, this module has no strings. */
  name: string | null;
  color: string | null;
  min: number;
};

/** Tracked minutes per category, largest first, empty categories dropped. */
export function trackedByCategory(rows: readonly TrackedTask[]): CategoryMinutes[] {
  const map = new Map<string, CategoryMinutes>();
  for (const r of rows) {
    const min = Number(r.minutes);
    if (!Number.isFinite(min) || min <= 0) continue;
    const id = r.channel_id ?? "none";
    const entry = map.get(id) ?? {
      id,
      name: r.channel_id ? r.channel_name : null,
      color: r.channel_id ? r.channel_color : null,
      min: 0,
    };
    entry.min += min;
    map.set(id, entry);
  }
  return [...map.values()].sort((a, b) => b.min - a.min);
}

export type CategoryAccuracy = CategoryMinutes & { estimatedMin: number; actualMin: number };

export type TrackedAccuracy = EstimateAccuracy & { byCategory: CategoryAccuracy[] };

/**
 * Estimated vs tracked, over the tasks that have BOTH. A task with time but no
 * estimate would read as a 100% overrun, one with an estimate but no time as a
 * perfect saving; neither says anything about how well the estimate held.
 *
 * "Real" is what was tracked in the period, not the task's lifetime total, so
 * a task worked across two periods is split between them. Its estimate still
 * counts whole in each: an estimate has no days to split it by.
 */
export function estimateVsTracked(rows: readonly TrackedTask[]): TrackedAccuracy {
  const comparable = rows.filter(
    (r) => (r.estimate_min ?? 0) > 0 && Number.isFinite(Number(r.minutes)) && Number(r.minutes) > 0,
  );
  const byCategory: CategoryAccuracy[] = trackedByCategory(comparable).map((c) => {
    let estimatedMin = 0;
    for (const r of comparable)
      if ((r.channel_id ?? "none") === c.id) estimatedMin += r.estimate_min!;
    return { ...c, estimatedMin, actualMin: c.min };
  });
  return {
    estimatedMin: byCategory.reduce((s, c) => s + c.estimatedMin, 0),
    actualMin: byCategory.reduce((s, c) => s + c.actualMin, 0),
    trackedCount: comparable.length,
    byCategory,
  };
}
