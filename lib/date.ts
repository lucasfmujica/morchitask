import { addDays as fnsAddDays, addMonths as fnsAddMonths, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";

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

/** The 7 calendar days of the week containing `day`. weekStartsOn: 0=Sun, 1=Mon. */
export function weekRange(day: DayISO, weekStartsOn: 0 | 1 = 1): DayISO[] {
  const date = parseISO(day);
  const dow = date.getDay(); // 0=Sun..6=Sat
  const diff = (dow - weekStartsOn + 7) % 7;
  const start = addDays(day, -diff);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** "Hoy" / "Mañana" / "Ayer", otherwise a friendly Spanish date. */
export function relativeLabel(day: DayISO, today: DayISO): string {
  if (day === today) return "Hoy";
  if (day === addDays(today, 1)) return "Mañana";
  if (day === addDays(today, -1)) return "Ayer";
  return format(parseISO(day), "EEEE d 'de' MMMM", { locale: es });
}

/** "Lunes 23 de junio" — capitalized weekday + day + month. */
export function fullDayLabel(day: DayISO): string {
  const raw = format(parseISO(day), "EEEE d 'de' MMMM", { locale: es });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Short weekday + day, e.g. "lun 23" — for week/month headers. */
export function shortDayLabel(day: DayISO): string {
  return format(parseISO(day), "EEE d", { locale: es });
}

/** "23 jun – 29 jun" for a week's first..last day. */
export function weekRangeLabel(week: DayISO[]): string {
  const a = format(parseISO(week[0]), "d MMM", { locale: es });
  const b = format(parseISO(week[week.length - 1]), "d MMM", { locale: es });
  return `${a} – ${b}`;
}

/** Heading for a day inside the week view: "Hoy"/"Mañana"/"Ayer" or "Lun 23". */
export function weekDayHeading(day: DayISO, today: DayISO): string {
  if (day === today) return "Hoy";
  if (day === addDays(today, 1)) return "Mañana";
  if (day === addDays(today, -1)) return "Ayer";
  const s = format(parseISO(day), "EEE d", { locale: es });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Shift a calendar day by `n` months (day-of-month clamped). */
export function addMonths(day: DayISO, n: number): DayISO {
  return format(fnsAddMonths(parseISO(day), n), "yyyy-MM-dd");
}

/** "Junio 2026" for the month containing `day`. */
export function monthLabel(day: DayISO): string {
  const s = format(parseISO(day), "MMMM yyyy", { locale: es });
  return s.charAt(0).toUpperCase() + s.slice(1);
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
