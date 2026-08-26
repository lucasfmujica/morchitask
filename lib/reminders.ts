/**
 * Per-task reminder helpers. A reminder is just an instant (`tasks.remind_at`)
 * the cron scans; these compute that instant relative to a task's time block.
 */

/** Offset presets, in minutes *before* the block start. 0 = at the start. */
export const REMINDER_OFFSETS = [0, 5, 15, 30] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

/** Instant (ISO) to fire the reminder, `offsetMin` before a block start. */
export function remindAtFromBlock(blockStartISO: string, offsetMin: number): string {
  const start = new Date(blockStartISO).getTime();
  return new Date(start - offsetMin * 60_000).toISOString();
}

/**
 * The preset offset (minutes) implied by a task's `remind_at` against its
 * `block_start`, or null when either is missing. Used to light up the active
 * chip. Negative/odd values just won't match a preset.
 */
export function offsetFromRemindAt(
  blockStartISO: string | null,
  remindAtISO: string | null,
): number | null {
  if (!blockStartISO || !remindAtISO) return null;
  return Math.round((new Date(blockStartISO).getTime() - new Date(remindAtISO).getTime()) / 60_000);
}

/**
 * Catalog key for an offset preset. Hands out a key rather than a word for the
 * same reason `lib/priority.ts` does: this module is imported by client and
 * server alike, and neither has a translator to hand at import time. The caller
 * passes `{ n: offsetMin }`; ICU ignores it for the "at the start" case.
 */
export function reminderOffsetLabelKey(offsetMin: number): "reminderAtStart" | "reminderBefore" {
  return offsetMin === 0 ? "reminderAtStart" : "reminderBefore";
}
