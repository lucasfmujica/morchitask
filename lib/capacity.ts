/** Default daily capacity when the user hasn't set one: 6 hours. */
export const DEFAULT_CAPACITY_MIN = 360;

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
