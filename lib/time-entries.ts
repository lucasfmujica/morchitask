import { fromZonedTime } from "date-fns-tz";
import { DEFAULT_TIMEZONE, addDays, dayISOInTimeZone, type DayISO } from "@/lib/date";

/** Minutes of tracked time attributed to one calendar day. */
export type TimeSegment = { day: DayISO; minutes: number };

/** The local instant (epoch ms) at which `day` starts in `timezone`. */
function startOfDayMs(day: DayISO, timezone: string): number {
  return fromZonedTime(`${day}T00:00:00`, timezone).getTime();
}

/**
 * Split a stopwatch run into per-calendar-day segments.
 *
 * Working past midnight is normal here, and charging the whole run to the day
 * you happened to press Stop would make the breakdown lie ("3h yesterday" for
 * work that was mostly today). So the run is cut at each local midnight and
 * each piece is charged to the day it actually happened in.
 *
 * Returns [] for a zero/negative span, so a double-tap on Stop logs nothing.
 */
export function splitRunByDay(
  startedAtMs: number,
  endedAtMs: number,
  timezone: string = DEFAULT_TIMEZONE,
): TimeSegment[] {
  if (!(endedAtMs > startedAtMs)) return [];

  const segments: TimeSegment[] = [];
  let cursor = startedAtMs;
  // Guard against a pathological clock (a run "started" months ago after a
  // system clock change) turning this into an unbounded loop.
  for (let guard = 0; guard < 400 && cursor < endedAtMs; guard++) {
    const day = dayISOInTimeZone(new Date(cursor), timezone);
    const nextMidnight = startOfDayMs(addDays(day, 1), timezone);
    const sliceEnd = Math.min(nextMidnight, endedAtMs);
    segments.push({ day, minutes: (sliceEnd - cursor) / 60_000 });
    cursor = sliceEnd;
  }
  return segments;
}

/** Total minutes across segments — what gets added to `actual_time_min`. */
export function totalMinutes(segments: TimeSegment[]): number {
  return segments.reduce((sum, s) => sum + s.minutes, 0);
}

/** Round to whole seconds, so hand-edited values don't carry float dust. */
function round(min: number): number {
  return Math.round(min * 60) / 60;
}

/**
 * What editing one day's time does to the task's total.
 *
 * Adding minutes to a day takes them out of "Sin fecha" first. That's the
 * whole point of the edit: you added two forgotten hours to "Real", they
 * landed in "Sin fecha" because nothing said when they happened, and now you
 * say "that was yesterday". Assigning a day must not double the total — only
 * what "Sin fecha" can't cover is genuinely new time.
 *
 * Lowering a day is the opposite claim ("I didn't actually spend that long"),
 * so it comes straight off the total.
 */
export function applyDayEdit(
  entries: EntryLike[],
  totalMin: number,
  userId: string,
  day: DayISO,
  minutes: number,
): { entryMinutes: number; nextTotal: number } {
  const entryMinutes = Math.max(0, round(minutes));
  const current = entries.find((e) => e.user_id === userId && e.day === day)?.minutes ?? 0;
  const tracked = entries.reduce((sum, e) => sum + e.minutes, 0);
  const untracked = Math.max(0, totalMin - tracked);

  const delta = entryMinutes - current;
  const totalDelta = delta > 0 ? Math.max(0, delta - untracked) : delta;
  return { entryMinutes, nextTotal: Math.max(0, round(totalMin + totalDelta)) };
}

/** A day's tracked time, optionally broken down by person. */
export type DayTotal = {
  day: DayISO;
  minutes: number;
  /** minutes per profile id — only interesting when both of us tracked the task. */
  byUser: { userId: string; minutes: number }[];
};

export type TimeBreakdown = {
  /** Newest day first — "hoy" is what you look at, so it goes on top. */
  days: DayTotal[];
  /** Sum of the per-day rows. */
  trackedMin: number;
  /**
   * Time on the task that no day can account for: rows written before this
   * feature existed, and manual edits of "Real". Shown as its own muted row so
   * the breakdown always adds up to the total the user sees.
   */
  untrackedMin: number;
  /** The largest single-day value, for scaling the bars. */
  maxDayMin: number;
};

type EntryLike = { day: DayISO; minutes: number; user_id: string };

/** A slice of the run in progress, not yet written to the database. */
export type LiveSegment = { day: DayISO; minutes: number; userId: string };

/**
 * Fold raw entry rows into the shape the UI renders, reconciled against the
 * task's total so the numbers can never visibly disagree.
 *
 * `live` is the run in progress (usually one segment, two when it has already
 * crossed midnight) so the current day's row ticks up while the stopwatch goes.
 */
export function buildTimeBreakdown(
  entries: EntryLike[],
  totalMin: number,
  live: LiveSegment[] = [],
): TimeBreakdown {
  const byDay = new Map<DayISO, Map<string, number>>();
  const add = (day: DayISO, userId: string, minutes: number) => {
    if (minutes <= 0) return;
    const users = byDay.get(day) ?? new Map<string, number>();
    users.set(userId, (users.get(userId) ?? 0) + minutes);
    byDay.set(day, users);
  };

  for (const e of entries) add(e.day, e.user_id, e.minutes);
  for (const l of live) add(l.day, l.userId, l.minutes);

  const days: DayTotal[] = [...byDay.entries()]
    .map(([day, users]) => ({
      day,
      minutes: [...users.values()].reduce((a, b) => a + b, 0),
      byUser: [...users.entries()]
        .map(([userId, minutes]) => ({ userId, minutes }))
        .sort((a, b) => b.minutes - a.minutes),
    }))
    // ISO days compare lexicographically, so this is a plain reverse sort.
    .sort((a, b) => (a.day < b.day ? 1 : -1));

  const trackedMin = days.reduce((sum, d) => sum + d.minutes, 0);
  const liveMin = totalMinutes(live);
  return {
    days,
    trackedMin,
    // The live run isn't in `totalMin` yet, so it can't count as unaccounted.
    untrackedMin: Math.max(0, totalMin + liveMin - trackedMin),
    maxDayMin: days.reduce((max, d) => Math.max(max, d.minutes), 0),
  };
}
