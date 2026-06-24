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

/** Short Spanish label for an offset preset. */
export function reminderOffsetLabel(offsetMin: number): string {
  return offsetMin === 0 ? "Al empezar" : `${offsetMin} min antes`;
}
