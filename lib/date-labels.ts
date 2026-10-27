import { format, parseISO } from "date-fns";
import { enUS, es } from "date-fns/locale";
import { addDays, ageInDays, type DayISO } from "@/lib/date";
import { DEFAULT_LOCALE, type Locale } from "@/lib/locale";

/**
 * Turning a calendar day into words.
 *
 * Split out of `lib/date.ts` so that module can stay pure date arithmetic —
 * timezone-correct and language-free — while everything that depends on what
 * language you read lives here.
 *
 * Swapping date-fns' locale object is not enough on its own. The patterns
 * themselves carry grammar: `"EEEE d 'de' MMMM"` has the Spanish *de* written
 * into it, and English puts the month before the day. Spanish also lowercases
 * weekday and month names, which is why the Spanish patterns get capitalized
 * afterwards and the English ones need no such help.
 */

type Patterns = {
  /** Weekday + day + month: "lunes 23 de junio" / "Monday, June 23". */
  full: string;
  /** Day + month, compact: "23 jun" / "Jun 23". */
  short: string;
  /** Abbreviated weekday + day: "lun 23" / "Mon 23". */
  weekday: string;
  /** date-fns locale, for the names those patterns expand to. */
  fns: typeof es;
  /** Spanish writes days and months lowercase; English already capitalizes. */
  capitalize: boolean;
};

const PATTERNS: Record<Locale, Patterns> = {
  es: { full: "EEEE d 'de' MMMM", short: "d MMM", weekday: "EEE d", fns: es, capitalize: true },
  en: { full: "EEEE, MMMM d", short: "MMM d", weekday: "EEE d", fns: enUS, capitalize: false },
};

/**
 * The words a date can turn into instead of a number.
 *
 * Passed in rather than kept in a table here so they live in the message
 * catalog like every other string. The `*Ago` entries are functions because
 * they pluralize, which is the catalog's job (ICU), not this module's — and
 * because the rules differ: Spanish says "hace un mes", not "hace 1 mes".
 */
export type RelativeWords = {
  today: string;
  tomorrow: string;
  yesterday: string;
  /** Mid-sentence forms, as in "creada hoy" / "created today". */
  todayLower: string;
  yesterdayLower: string;
  daysAgo: (n: number) => string;
  monthsAgo: (n: number) => string;
};

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Builds the day-labelling functions for one language.
 *
 * `words` is passed in rather than kept here so the relative words live in the
 * message catalog like every other string, instead of being duplicated in a
 * table this module owns.
 */
export function createDateLabels(locale: Locale, words: RelativeWords) {
  const p = PATTERNS[locale] ?? PATTERNS[DEFAULT_LOCALE];
  const write = (day: DayISO, pattern: string) => format(parseISO(day), pattern, { locale: p.fns });
  const titled = (day: DayISO, pattern: string) => {
    const s = write(day, pattern);
    return p.capitalize ? upperFirst(s) : s;
  };

  /** Today / Tomorrow / Yesterday, else the full date. */
  function relativeLabel(day: DayISO, today: DayISO): string {
    if (day === today) return words.today;
    if (day === addDays(today, 1)) return words.tomorrow;
    if (day === addDays(today, -1)) return words.yesterday;
    return write(day, p.full);
  }

  /** Same idea, but short enough for a dense list — and unambiguous across
   *  months, unlike a bare weekday. */
  function compactDayLabel(day: DayISO, today: DayISO): string {
    if (day === today) return words.today;
    if (day === addDays(today, -1)) return words.yesterday;
    if (day === addDays(today, 1)) return words.tomorrow;
    return write(day, p.short);
  }

  /** A day as a heading: "Lunes 23 de junio" / "Monday, June 23". */
  function fullDayLabel(day: DayISO): string {
    return titled(day, p.full);
  }

  /** Abbreviated weekday + day, for week and month headers. */
  function shortDayLabel(day: DayISO): string {
    return write(day, p.weekday);
  }

  /** A week's span: "23 jun – 29 jun" / "Jun 23 – Jun 29". */
  function weekRangeLabel(week: DayISO[]): string {
    return `${write(week[0], p.short)} – ${write(week[week.length - 1], p.short)}`;
  }

  /** Heading for one column of the week view. */
  function weekDayHeading(day: DayISO, today: DayISO): string {
    if (day === today) return words.today;
    if (day === addDays(today, 1)) return words.tomorrow;
    if (day === addDays(today, -1)) return words.yesterday;
    return titled(day, p.weekday);
  }

  /**
   * Column headers for a month grid, Monday first: "lun mar mié…" /
   * "Mon Tue Wed…".
   *
   * Derived rather than kept in the catalog because date-fns already knows
   * these names in both languages, and its Spanish output is exactly what the
   * grid showed before. Two lists that must agree are two lists that can drift.
   */
  function weekdayHeaders(): string[] {
    // Any Monday will do — only the weekday name is read back.
    const MONDAY = "2024-01-01";
    return Array.from({ length: 7 }, (_, i) => write(addDays(MONDAY, i), "EEE"));
  }

  /** The month a day belongs to: "Junio 2026" / "June 2026". */
  function monthLabel(day: DayISO): string {
    return titled(day, "MMMM yyyy");
  }

  /**
   * Badge for a due date. Same shape as `compactDayLabel` — near days become
   * words, everything else a short date — and deliberately delegates rather
   * than repeating it, so the two can never drift apart visually.
   */
  function dueLabel(due: DayISO, today: DayISO): string {
    return compactDayLabel(due, today);
  }

  /**
   * How long something has been waiting: "hoy", "ayer", "hace 12 días",
   * "hace 3 meses".
   *
   * This is what makes the backlog honest — a list of titles hides that an
   * idea has been sitting since March, and that age IS the decision. Months
   * are approximated at 30 days on purpose: past a few weeks the exact figure
   * stops mattering.
   */
  function ageLabel(createdAt: string, today?: DayISO): string {
    const days = ageInDays(createdAt, today);
    if (days === 0) return words.todayLower;
    if (days === 1) return words.yesterdayLower;
    if (days < 30) return words.daysAgo(days);
    return words.monthsAgo(Math.round(days / 30));
  }

  return {
    relativeLabel,
    compactDayLabel,
    fullDayLabel,
    shortDayLabel,
    weekRangeLabel,
    weekDayHeading,
    weekdayHeaders,
    monthLabel,
    dueLabel,
    ageLabel,
  };
}

export type DateLabels = ReturnType<typeof createDateLabels>;
