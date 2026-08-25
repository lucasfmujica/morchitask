import { describe, expect, it } from "vitest";
import { addDays } from "./date";
import { createDateLabels, type RelativeWords } from "./date-labels";

const ES: RelativeWords = {
  today: "Hoy",
  tomorrow: "Mañana",
  yesterday: "Ayer",
  todayLower: "hoy",
  yesterdayLower: "ayer",
  daysAgo: (n) => `hace ${n} días`,
  monthsAgo: (n) => (n === 1 ? "hace un mes" : `hace ${n} meses`),
};
const EN: RelativeWords = {
  today: "Today",
  tomorrow: "Tomorrow",
  yesterday: "Yesterday",
  todayLower: "today",
  yesterdayLower: "yesterday",
  daysAgo: (n) => `${n} days ago`,
  monthsAgo: (n) => (n === 1 ? "a month ago" : `${n} months ago`),
};

const es = createDateLabels("es", ES);
const en = createDateLabels("en", EN);

// Pinned to real dates so weekday names are fixed, not "whatever today is".
const MON = "2026-06-22"; // Monday
const TUE = "2026-06-23";
const SUN = "2026-06-21";
const SUN_NEXT = "2026-06-28"; // end of MON's week
const LATER = "2026-07-27"; // also a Monday, a month out

describe("Spanish output is exactly what the app produced before the split", () => {
  it("relativeLabel", () => {
    expect(es.relativeLabel(MON, MON)).toBe("Hoy");
    expect(es.relativeLabel(TUE, MON)).toBe("Mañana");
    expect(es.relativeLabel(SUN, MON)).toBe("Ayer");
    expect(es.relativeLabel(LATER, MON)).toBe("lunes 27 de julio");
  });

  it("compactDayLabel", () => {
    expect(es.compactDayLabel(MON, MON)).toBe("Hoy");
    expect(es.compactDayLabel(SUN, MON)).toBe("Ayer");
    expect(es.compactDayLabel(LATER, MON)).toBe("27 jul");
  });

  it("fullDayLabel capitalizes, because Spanish writes the weekday lowercase", () => {
    expect(es.fullDayLabel(MON)).toBe("Lunes 22 de junio");
  });

  it("shortDayLabel", () => {
    expect(es.shortDayLabel(MON)).toBe("lun 22");
  });

  it("weekRangeLabel", () => {
    expect(es.weekRangeLabel([MON, SUN_NEXT])).toBe("22 jun – 28 jun");
  });

  it("weekDayHeading", () => {
    expect(es.weekDayHeading(MON, MON)).toBe("Hoy");
    expect(es.weekDayHeading(LATER, MON)).toBe("Lun 27");
  });
});

describe("English uses its own patterns, not the Spanish ones re-localized", () => {
  it("puts the month before the day and drops the 'de'", () => {
    // The whole reason this module exists: "EEEE d 'de' MMMM" with an English
    // locale would read "Monday 27 de July".
    expect(en.relativeLabel(LATER, MON)).toBe("Monday, July 27");
    expect(en.fullDayLabel(MON)).toBe("Monday, June 22");
    expect(en.compactDayLabel(LATER, MON)).toBe("Jul 27");
    expect(en.weekRangeLabel([MON, SUN_NEXT])).toBe("Jun 22 – Jun 28");
  });

  it("uses the translated relative words", () => {
    expect(en.relativeLabel(MON, MON)).toBe("Today");
    expect(en.relativeLabel(TUE, MON)).toBe("Tomorrow");
    expect(en.relativeLabel(SUN, MON)).toBe("Yesterday");
  });

  it("needs no capitalization fix — English already capitalizes", () => {
    expect(en.shortDayLabel(MON)).toBe("Mon 22");
    expect(en.weekDayHeading(LATER, MON)).toBe("Mon 27");
  });
});

describe("edge cases", () => {
  it("labels a day in another year without confusion", () => {
    expect(es.compactDayLabel("2027-01-05", MON)).toBe("5 ene");
    expect(en.compactDayLabel("2027-01-05", MON)).toBe("Jan 5");
  });

  it("spans a week that crosses a month boundary", () => {
    expect(es.weekRangeLabel(["2026-06-29", "2026-07-05"])).toBe("29 jun – 5 jul");
    expect(en.weekRangeLabel(["2026-06-29", "2026-07-05"])).toBe("Jun 29 – Jul 5");
  });

  it("falls back to Spanish patterns for an unknown locale rather than throwing", () => {
    // @ts-expect-error — exercising the runtime guard, not the type
    const unknown = createDateLabels("pt", ES);
    expect(unknown.fullDayLabel(MON)).toBe("Lunes 22 de junio");
  });
});

describe("monthLabel, dueLabel and ageLabel", () => {
  it("names the month, capitalized in Spanish", () => {
    expect(es.monthLabel(MON)).toBe("Junio 2026");
    expect(en.monthLabel(MON)).toBe("June 2026");
  });

  it("labels a due date the same way a nearby day is labelled", () => {
    expect(es.dueLabel(MON, MON)).toBe("Hoy");
    expect(es.dueLabel(TUE, MON)).toBe("Mañana");
    expect(es.dueLabel(LATER, MON)).toBe("27 jul");
    expect(en.dueLabel(LATER, MON)).toBe("Jul 27");
  });

  /** A timestamp exactly `n` days before MON, so ages are deterministic. */
  const daysBefore = (n: number) => `${addDays(MON, -n)}T12:00:00.000Z`;

  it("reads ages in lowercase, because they sit mid-sentence", () => {
    expect(es.ageLabel(daysBefore(0), MON)).toBe("hoy");
    expect(es.ageLabel(daysBefore(1), MON)).toBe("ayer");
    expect(en.ageLabel(daysBefore(0), MON)).toBe("today");
  });

  it("pluralizes, including the one case each language spells out", () => {
    expect(es.ageLabel(daysBefore(12), MON)).toBe("hace 12 días");
    expect(es.ageLabel(daysBefore(29), MON)).toBe("hace 29 días");
    // Spanish writes "un mes", not "1 mes" — the reason these are functions
    // fed by the catalog rather than string concatenation.
    expect(es.ageLabel(daysBefore(30), MON)).toBe("hace un mes");
    expect(es.ageLabel(daysBefore(90), MON)).toBe("hace 3 meses");

    expect(en.ageLabel(daysBefore(12), MON)).toBe("12 days ago");
    expect(en.ageLabel(daysBefore(30), MON)).toBe("a month ago");
    expect(en.ageLabel(daysBefore(90), MON)).toBe("3 months ago");
  });

  it("rounds to the nearest month past the 30-day threshold", () => {
    expect(es.ageLabel(daysBefore(45), MON)).toBe("hace 2 meses"); // 45/30 = 1.5 -> 2
    expect(es.ageLabel(daysBefore(74), MON)).toBe("hace 2 meses");
  });
});
