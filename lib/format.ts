/**
 * Canonical time-estimate options (in minutes) for the duration picker.
 * Covers quick tasks (15m) up to long, half-day blocks (8h) so longer work
 * has an option too. Shared by the detail sheet picker and the card's cycle.
 */
export const TIME_ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

/** Minutes as a compact human label: 45 → "45m", 90 → "1h 30m", 120 → "2h". */
export function formatMinutes(min: number): string {
  if (min <= 0) return "0m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Tracked time as a compact label with second precision:
 *  23 → "23s", 90 → "1m 30s", 2700 → "45m", 5400 → "1h 30m". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (min < 60) return sec ? `${min}m ${sec}s` : `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Seconds as a stopwatch clock: 1429 → "0:23:49", 3661 → "1:01:01". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
