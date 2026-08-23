import type { Task } from "@/lib/queries/types";

/** Default daily capacity when the user hasn't set one: 6 hours. */
export const DEFAULT_CAPACITY_MIN = 360;

/** Capacity is adjusted in half-hour steps, within a sane day's range. */
export const CAPACITY_STEP_MIN = 30;
export const CAPACITY_MIN_MIN = 30;
export const CAPACITY_MAX_MIN = 960; // 16h

/** Snap a capacity value to the nearest 30 min and keep it within range. */
export function clampCapacity(min: number): number {
  const stepped = Math.round(min / CAPACITY_STEP_MIN) * CAPACITY_STEP_MIN;
  return Math.max(CAPACITY_MIN_MIN, Math.min(CAPACITY_MAX_MIN, stepped));
}

/**
 * The capacity to show for a given day: the day's own value wins, then the
 * person's saved default, then the built-in 6h.
 */
export function resolveCapacity(
  perDayMin: number | null | undefined,
  profileDefaultMin: number | null | undefined,
): number {
  return perDayMin ?? profileDefaultMin ?? DEFAULT_CAPACITY_MIN;
}

export type CapacityState = {
  /** Fill width as a 0–100 percentage (clamped). */
  pct: number;
  /** Planned time exceeds the target. */
  over: boolean;
  /** At/above 85% of target but not yet over. */
  near: boolean;
  /** Minutes over target (0 when within budget). */
  overByMin: number;
};

/**
 * How full a day is relative to a person's daily capacity budget. Pure so it
 * can be unit-tested and shared by the Day view and the morning plan.
 */
export function capacityState(plannedMin: number, targetMin: number): CapacityState {
  if (targetMin <= 0) {
    return { pct: 0, over: false, near: false, overByMin: 0 };
  }
  const ratio = plannedMin / targetMin;
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const over = plannedMin > targetMin;
  const near = !over && ratio >= 0.85;
  return { pct, over, near, overByMin: Math.max(0, plannedMin - targetMin) };
}

/**
 * The concrete nudge behind an over-planned day: "mové X a mañana y entrás
 * justo". Picks the biggest pending task that has no time block yet — moving
 * something already placed in the agenda would leave a hole and undo a
 * decision the person already made.
 *
 * Returns null when the day isn't over budget or nothing is movable, so the
 * caller can render the plain over-by message without a suggestion.
 */
export function capacitySuggestion(
  tasks: readonly Task[],
  plannedMin: number,
  targetMin: number,
): { overByMin: number; task: Task | null } | null {
  const { over, overByMin } = capacityState(plannedMin, targetMin);
  if (!over) return null;

  const movable = tasks
    .filter((t) => t.status !== "done" && !t.block_start && (t.time_estimate_min ?? 0) > 0)
    // Biggest first; ties broken by title so the suggestion doesn't flicker
    // between two equal tasks as the query refetches.
    .sort(
      (a, b) =>
        (b.time_estimate_min ?? 0) - (a.time_estimate_min ?? 0) || a.title.localeCompare(b.title),
    );

  return { overByMin, task: movable[0] ?? null };
}
