import { differenceInCalendarDays, getDaysInMonth, parseISO, startOfWeek } from "date-fns";
import { addDays, type DayISO } from "@/lib/date";

/**
 * Streak logic for recurring routines.
 *
 * A routine's completed instances are the days where its generated task is
 * `done` (linked by `template_id` + `template_date`). The streak counts how
 * many *expected* occurrences in a row — walking back from today — are done.
 *
 * `weekdays` follow the ISO convention used across the app: 1 = Monday … 7 =
 * Sunday (see WEEKDAYS in routines-view).
 */

/** ISO weekday (1=Mon … 7=Sun) for a calendar day. */
function isoWeekday(day: DayISO): number {
  const dow = parseISO(day).getDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow;
}

/** The recurrence fields of a routine template (see recurring_templates). */
export type Recurrence = {
  freq: string;
  weekdays: number[] | null;
  /** Every N days / weeks / months, counted from `active_from`. Default 1. */
  repeat_every?: number | null;
  /** Monthly: day of the month; past a short month's end → its last day. */
  month_day?: number | null;
  /** Anchor for "every N" and the monthly fallback day. */
  active_from?: DayISO | null;
};

/**
 * Whether `day` is a day the routine is supposed to run. Mirrors the SQL in
 * `ensure_day_materialized` (drizzle/migrations/0009) — keep both in sync.
 */
export function isExpectedOccurrence(rule: Recurrence, day: DayISO): boolean {
  const every = Math.max(1, rule.repeat_every ?? 1);
  const from = rule.active_from ?? null;
  if (from && day < from) return false;

  if (rule.freq === "weekly") {
    if (!rule.weekdays || rule.weekdays.length === 0) return false;
    if (!rule.weekdays.includes(isoWeekday(day))) return false;
    if (every === 1 || !from) return true;
    const weeks = differenceInCalendarDays(weekStart(day), weekStart(from)) / 7;
    return weeks % every === 0;
  }

  if (rule.freq === "monthly") {
    const d = parseISO(day);
    const anchorDay = rule.month_day ?? (from ? parseISO(from).getDate() : 1);
    if (d.getDate() !== Math.min(anchorDay, getDaysInMonth(d))) return false;
    if (every === 1 || !from) return true;
    const f = parseISO(from);
    const months = (d.getFullYear() - f.getFullYear()) * 12 + d.getMonth() - f.getMonth();
    return months % every === 0;
  }

  // daily (and any unknown freq) runs every day — or every N days
  if (every === 1 || !from) return true;
  return differenceInCalendarDays(parseISO(day), parseISO(from)) % every === 0;
}

function weekStart(day: DayISO): Date {
  return startOfWeek(parseISO(day), { weekStartsOn: 1 });
}

/**
 * Current streak: consecutive expected occurrences completed, counting back
 * from `today`. Today's own occurrence is given grace — if it isn't done yet it
 * doesn't break the streak (it just doesn't add to it), so the count stays
 * stable until the day actually ends.
 */
export function currentStreak(
  rule: Recurrence,
  completed: ReadonlySet<DayISO>,
  today: DayISO,
  maxLookbackDays = 366,
): number {
  let streak = 0;
  let sawExpected = false;
  let day = today;

  for (let i = 0; i < maxLookbackDays; i++) {
    if (isExpectedOccurrence(rule, day)) {
      if (completed.has(day)) {
        streak++;
      } else if (!sawExpected && day === today) {
        // today's occurrence isn't done yet — grace, keep going
      } else {
        break;
      }
      sawExpected = true;
    }
    day = addDays(day, -1);
  }

  return streak;
}

export type OccurrenceCell = { date: DayISO; done: boolean };

/**
 * The last `count` expected occurrences (oldest → newest) with their done
 * state — for a small heatmap. Today is always included as the newest cell
 * when it's an expected day.
 */
export function recentOccurrences(
  rule: Recurrence,
  completed: ReadonlySet<DayISO>,
  today: DayISO,
  count: number,
  maxLookbackDays = 366,
): OccurrenceCell[] {
  const cells: OccurrenceCell[] = [];
  let day = today;

  for (let i = 0; i < maxLookbackDays && cells.length < count; i++) {
    if (isExpectedOccurrence(rule, day)) {
      cells.push({ date: day, done: completed.has(day) });
    }
    day = addDays(day, -1);
  }

  return cells.reverse();
}
