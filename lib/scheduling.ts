/**
 * Pure helpers for multi-block scheduling. A task can be placed in the agenda
 * as several time-blocks (e.g. a 2h task split into two 1h sessions). These
 * compute how much of a task is still unscheduled, so it keeps showing in the
 * "to schedule" list until its blocks cover its estimate.
 *
 * Durations are timezone-agnostic (end − start in ms), so no TZ is needed here.
 */

type BlockTimes = { start_at: string; end_at: string };

/** Whole minutes between a block's start and end. */
export function blockDurationMin(block: BlockTimes): number {
  const ms = new Date(block.end_at).getTime() - new Date(block.start_at).getTime();
  return Math.max(0, Math.round(ms / 60_000));
}

/** Total minutes already scheduled across a task's blocks. */
export function scheduledMin(blocks: readonly BlockTimes[]): number {
  return blocks.reduce((sum, b) => sum + blockDurationMin(b), 0);
}

/**
 * Minutes still to schedule for a task — `estimate − already scheduled`.
 * Returns null when the task has no estimate (we can't know what's "left").
 */
export function remainingMin(
  estimateMin: number | null,
  blocks: readonly BlockTimes[],
): number | null {
  if (estimateMin == null) return null;
  return Math.max(0, estimateMin - scheduledMin(blocks));
}

/** Below this, a leftover sliver isn't worth keeping in the list. */
export const MIN_SCHEDULABLE_MIN = 15;

/**
 * Whether the task should still appear in the "to schedule" list:
 * - never scheduled → yes;
 * - has an estimate with a meaningful remainder → yes (drag again for the rest);
 * - otherwise (no estimate but already has a block, or fully covered) → no.
 */
export function showInUnscheduled(
  estimateMin: number | null,
  blocks: readonly BlockTimes[],
): boolean {
  if (blocks.length === 0) return true;
  const rem = remainingMin(estimateMin, blocks);
  return rem != null && rem >= MIN_SCHEDULABLE_MIN;
}

/**
 * Duration (minutes) to give the NEXT block dragged from the list: the
 * remaining time when there's an estimate with room left, else the estimate
 * itself, else a sensible default.
 */
export function nextBlockDurationMin(
  estimateMin: number | null,
  blocks: readonly BlockTimes[],
  fallback = 30,
): number {
  const rem = remainingMin(estimateMin, blocks);
  if (rem != null && rem > 0) return rem;
  return estimateMin ?? fallback;
}
