import { parseISO } from "date-fns";
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

/** Whether `day` is a day the routine is supposed to run. */
export function isExpectedOccurrence(
  freq: string,
  weekdays: number[] | null,
  day: DayISO,
): boolean {
  if (freq === "weekly") {
    if (!weekdays || weekdays.length === 0) return false;
    return weekdays.includes(isoWeekday(day));
  }
  return true; // daily (and any unknown freq) runs every day
}

/**
 * Current streak: consecutive expected occurrences completed, counting back
 * from `today`. Today's own occurrence is given grace — if it isn't done yet it
 * doesn't break the streak (it just doesn't add to it), so the count stays
 * stable until the day actually ends.
 */
export function currentStreak(
  freq: string,
  weekdays: number[] | null,
  completed: ReadonlySet<DayISO>,
  today: DayISO,
  maxLookbackDays = 366,
): number {
  let streak = 0;
  let sawExpected = false;
  let day = today;

  for (let i = 0; i < maxLookbackDays; i++) {
    if (isExpectedOccurrence(freq, weekdays, day)) {
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
  freq: string,
  weekdays: number[] | null,
  completed: ReadonlySet<DayISO>,
  today: DayISO,
  count: number,
  maxLookbackDays = 366,
): OccurrenceCell[] {
  const cells: OccurrenceCell[] = [];
  let day = today;

  for (let i = 0; i < maxLookbackDays && cells.length < count; i++) {
    if (isExpectedOccurrence(freq, weekdays, day)) {
      cells.push({ date: day, done: completed.has(day) });
    }
    day = addDays(day, -1);
  }

  return cells.reverse();
}
