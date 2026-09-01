import { addDays as fnsAddDays, addMonths as fnsAddMonths, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** A calendar day as "YYYY-MM-DD" (matches Postgres `date`). */
export type DayISO = string;

export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

/** The calendar day of `instant` within a given IANA timezone. */
export function dayISOInTimeZone(instant: Date, timezone: string): DayISO {
  return formatInTimeZone(instant, timezone, "yyyy-MM-dd");
}

/** Today's calendar day in the household timezone. */
export function todayISO(timezone: string = DEFAULT_TIMEZONE): DayISO {
  return dayISOInTimeZone(new Date(), timezone);
}

/** Shift a calendar day by `n` days (can be negative). Calendar-safe. */
export function addDays(day: DayISO, n: number): DayISO {
  return format(fnsAddDays(parseISO(day), n), "yyyy-MM-dd");
}

/**
 * Where leftover work should land when you close `day`.
 *
 * Normally that's the next day — but closing a day that's already past used to
 * send its pending tasks to *its* next day, which is still in the past. They
 * landed on a date "Hoy" never shows, so they looked deleted. Never carry
 * backwards: the floor is today.
 * Safe to compare lexicographically since both are "YYYY-MM-DD".
 */
export function carryOverTarget(day: DayISO, today: DayISO = todayISO()): DayISO {
  const next = addDays(day, 1);
  return next < today ? today : next;
}

/** The 7 calendar days of the week containing `day`. weekStartsOn: 0=Sun, 1=Mon. */
export function weekRange(day: DayISO, weekStartsOn: 0 | 1 = 1): DayISO[] {
  const date = parseISO(day);
  const dow = date.getDay(); // 0=Sun..6=Sat
  const diff = (dow - weekStartsOn + 7) % 7;
  const start = addDays(day, -diff);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Shift a calendar day by `n` months (day-of-month clamped). */
export function addMonths(day: DayISO, n: number): DayISO {
  return format(fnsAddMonths(parseISO(day), n), "yyyy-MM-dd");
}

/** The "YYYY-MM" month part — for same-month comparisons. */
export function monthOf(day: DayISO): string {
  return day.slice(0, 7);
}

/**
 * A 6×7 calendar grid (weeks of days as "YYYY-MM-DD") covering the month of
 * `day`, including leading/trailing days from adjacent months.
 */
export function monthGrid(day: DayISO, weekStartsOn: 0 | 1 = 1): DayISO[][] {
  const date = parseISO(day);
  const firstISO = format(new Date(date.getFullYear(), date.getMonth(), 1), "yyyy-MM-dd");
  const firstDow = parseISO(firstISO).getDay(); // 0=Sun..6=Sat
  const lead = (firstDow - weekStartsOn + 7) % 7;
  const start = addDays(firstISO, -lead);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7));
}

// ------------------------------------------------------------ due dates

/** Urgency of a due date relative to `today` — drives the badge colour. */
export type DueTone = "overdue" | "soon" | "later";

/** Classify a due date: past = overdue, today/tomorrow = soon, else later.
 *  Safe to compare lexicographically since both are "YYYY-MM-DD". */
export function dueTone(due: DayISO, today: DayISO): DueTone {
  if (due < today) return "overdue";
  if (due === today || due === addDays(today, 1)) return "soon";
  return "later";
}

/**
 * How long something has been sitting there: "hoy", "ayer", "hace 12 días",
 * "hace 3 meses".
 *
 * This is what makes the backlog honest — a list of titles hides that an idea
 * has been waiting since March, and that age IS the decision (schedule it or
 * let it go). Months are approximated at 30 days on purpose: past a few weeks
 * the exact figure stops mattering and "hace 3 meses" is the useful sentence.
 */
export function ageInDays(createdAt: string, today: DayISO = todayISO()): number {
  const created = dayISOInTimeZone(parseISO(createdAt), DEFAULT_TIMEZONE);
  return Math.max(
    0,
    Math.round((parseISO(today).getTime() - parseISO(created).getTime()) / 86_400_000),
  );
}

// ------------------------------------------------------------ time-blocking

/** UTC instant (ISO) for a local "HH:mm" on `day` in the household timezone. */
export function blockInstant(day: DayISO, time: string, timezone: string): string {
  return fromZonedTime(`${day}T${time}:00`, timezone).toISOString();
}

/** Local "HH:mm" of an instant within the household timezone. */
export function timeInTimeZone(instant: string, timezone: string): string {
  return formatInTimeZone(parseISO(instant), timezone, "HH:mm");
}

/** Minutes since local midnight of an instant within the household timezone. */
export function minutesFromMidnight(instant: string, timezone: string): number {
  const [h, m] = formatInTimeZone(parseISO(instant), timezone, "HH:mm").split(":").map(Number);
  return h * 60 + m;
}
