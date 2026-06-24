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

/**
 * Parse a human time string into minutes (fractional, capped at 24h). Accepts
 * "90", "90m", "45min", "1h", "1.5h", "1h 30m", "1h30", "1m 30s", "0:45".
 * Returns null for empty or unparseable input (the caller treats that as
 * "clear the value").
 */
export function parseDuration(input: string): number | null {
  const str = input.trim().toLowerCase();
  if (!str) return null;

  let total: number | null = null;

  // Clock form "h:mm".
  const clock = str.match(/^(\d+):([0-5]?\d)$/);
  if (clock) {
    total = Number(clock[1]) * 60 + Number(clock[2]);
  } else {
    // Unit tokens: hours, minutes, seconds (any subset, in any order).
    const h = str.match(/(\d+(?:\.\d+)?)\s*h/);
    const m = str.match(/(\d+(?:\.\d+)?)\s*m(?:in)?/);
    const s = str.match(/(\d+(?:\.\d+)?)\s*s/);
    if (h || m || s) {
      total = 0;
      if (h) total += parseFloat(h[1]) * 60;
      if (m) total += parseFloat(m[1]);
      if (s) total += parseFloat(s[1]) / 60;
      // "1h30" — a bare number trailing the hours with no unit means minutes.
      if (h && !m) {
        const trailing = str.match(/h\s*(\d+)\s*$/);
        if (trailing) total += Number(trailing[1]);
      }
    } else if (/^\d+(?:\.\d+)?$/.test(str)) {
      // A plain number is minutes (matches how estimates are entered).
      total = parseFloat(str);
    }
  }

  if (total === null || total <= 0) return null;
  const capped = Math.min(total, 24 * 60);
  return Math.round(capped * 100) / 100;
}

/** Seconds as a stopwatch clock: 1429 → "0:23:49", 3661 → "1:01:01". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
