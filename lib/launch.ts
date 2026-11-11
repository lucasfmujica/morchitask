import { addDays, type DayISO } from "@/lib/date";

/**
 * The launch's calendar, from the approved launch plan.
 *
 * The plan sets a cut criterion: by the cut date, enough people have to be
 * paying to justify continuing. The admin metrics page counts towards it, so
 * the dates live here as data rather than as numbers typed into a component.
 *
 * Calendar days in Buenos Aires, like every other `DayISO` in the app.
 */

export const LAUNCH_DAY: DayISO = "2026-11-30";

/** The day the cut criterion is judged. */
export const CUT_DAY: DayISO = "2027-01-28";

/**
 * The holidays, inclusive at both ends.
 *
 * Excluded from the day count because almost nobody starts a new planning
 * habit between Christmas and the first Monday of January. Counting those two
 * weeks would make the launch look like it had more runway than it had.
 */
export const HOLIDAYS = { from: "2026-12-21", to: "2027-01-03" } as const satisfies {
  from: DayISO;
  to: DayISO;
};

/** Payments needed by the cut day to keep going. */
export const PAYMENTS_TARGET = 15;

export function isHoliday(day: DayISO): boolean {
  // DayISO strings compare correctly as text: fixed width, most significant first.
  return day >= HOLIDAYS.from && day <= HOLIDAYS.to;
}

/** Non-holiday days from `from` to `to`, both included. Zero when `to` is
 *  before `from`. */
export function countedDays(from: DayISO, to: DayISO): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isHoliday(d)) n++;
  }
  return n;
}

/** How many counted days the launch has, launch and cut day included.
 *  Derived, not typed: an early mock-up said "60", which is the calendar
 *  length before the holidays are taken out. */
export const LAUNCH_TOTAL_DAYS = countedDays(LAUNCH_DAY, CUT_DAY);

/**
 * Which counted day of the launch `today` is.
 *
 * 0 before launch, capped at the total after the cut. During the holidays it
 * holds at the last working day's number instead of advancing.
 */
export function launchDayNumber(today: DayISO): number {
  if (today < LAUNCH_DAY) return 0;
  return countedDays(LAUNCH_DAY, today < CUT_DAY ? today : CUT_DAY);
}
