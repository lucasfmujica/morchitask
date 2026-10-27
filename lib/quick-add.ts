import { addMonths as fnsAddMonths, format, getDaysInMonth, parseISO } from "date-fns";
import { addDays, type DayISO } from "@/lib/date";
import { parseDuration } from "@/lib/format";
import type { TaskPriority } from "@/lib/priority";

/**
 * Natural-language quick add: "pagar la luz mañana 18hs 30m !alta #casa" →
 * title "pagar la luz", tomorrow, an 18:00 block, 30m estimate, high priority,
 * category "casa".
 *
 * Pure and token-based. JS `\b` treats ñ/á/é as non-word characters, so every
 * token is compared on a lowercased, accent-stripped copy and only ever as a
 * WHOLE token — "hoyo", "mañanero" or "500 pesos" never fire. Each kind is
 * taken once (the first occurrence); a second "mañana" stays in the title.
 */
export type QuickAddKind = "date" | "time" | "estimate" | "priority" | "channel";

export type QuickAddMatch = {
  kind: QuickAddKind;
  /** The original text that produced it, e.g. "a las 9". */
  text: string;
  start: number;
  end: number;
};

export type QuickAddResult = {
  title: string;
  plannedDate?: DayISO;
  /** Local "HH:mm". */
  time?: string;
  estimateMin?: number;
  priority?: TaskPriority;
  channelId?: string;
  matches: QuickAddMatch[];
};

export type QuickAddOptions = {
  today: DayISO;
  channels?: readonly { id: string; name: string }[];
  /** Kinds the user dismissed: their tokens stay in the title, untouched. */
  ignore?: ReadonlySet<QuickAddKind> | readonly QuickAddKind[];
};

type Token = { raw: string; norm: string; start: number; end: number };

/** Lowercase, strip accents (ñ → n), drop trailing punctuation. */
export function normalizeWord(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.,;?¡¿)]+$/, "");
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const PRIORITIES: Record<string, TaskPriority> = { alta: "high", media: "medium", baja: "low" };

/** "el lunes", "este viernes", "próximo martes" — the article goes with the date. */
const DATE_LEADS = new Set(["el", "este", "proximo", "prox"]);

const pad = (n: number) => String(n).padStart(2, "0");

function hhmm(h: number, m: number): string | null {
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

/** "9", "9:30", "9am", "9:30pm", "18hs", "18h" (only when `allowBare`). */
function readClock(
  norm: string,
  { allowBare, suffix }: { allowBare: boolean; suffix?: string },
): string | null {
  const m = norm.match(/^(\d{1,2})(?::(\d{2}))?(hs|h|am|pm)?$/);
  if (!m) return null;
  const unit = m[3] ?? suffix;
  const min = m[2] ? Number(m[2]) : 0;
  let h = Number(m[1]);
  if (unit === "am" || unit === "pm") {
    if (h < 1 || h > 12) return null;
    if (unit === "am" && h === 12) h = 0;
    if (unit === "pm" && h !== 12) h += 12;
    return hhmm(h, min);
  }
  // "18h" on its own is a duration; "18hs" or "18:30" is a time of day.
  if (unit === "hs" || m[2] || allowBare) return hhmm(h, min);
  return null;
}

/** Next date strictly after `today` that falls on `dow` (lunes on a Monday = next week). */
function nextWeekday(today: DayISO, dow: number): DayISO {
  const diff = (dow - parseISO(today).getDay() + 7) % 7 || 7;
  return addDays(today, diff);
}

/** "el 15" → the next 15th, today included; skips months that don't have one. */
function nextDayOfMonth(today: DayISO, day: number): DayISO | null {
  if (day < 1 || day > 31) return null;
  const base = parseISO(today);
  for (let i = 0; i < 12; i++) {
    const month = fnsAddMonths(new Date(base.getFullYear(), base.getMonth(), 1), i);
    if (day > getDaysInMonth(month)) continue;
    const iso = format(new Date(month.getFullYear(), month.getMonth(), day), "yyyy-MM-dd");
    if (iso >= today) return iso;
  }
  return null;
}

/** "15/11" or "15/11/2027". Without a year a date already gone means next year's. */
function readSlashDate(norm: string, today: DayISO): DayISO | null {
  const m = norm.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1) return null;
  const thisYear = Number(today.slice(0, 4));
  const build = (y: number) =>
    d <= getDaysInMonth(new Date(y, mo - 1, 1)) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  if (m[3]) return build(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]));
  const candidate = build(thisYear);
  if (candidate && candidate >= today) return candidate;
  return build(thisYear + 1);
}

const DURATION_TOKEN = /^(?:\d+(?:[.,]\d+)?h(?:\d{1,2}m?)?|\d+(?:m|min|mins))$/;
const MINUTES_TOKEN = /^\d{1,2}(?:m|min|mins)$/;
const MINUTE_WORDS = new Set(["min", "mins", "minuto", "minutos"]);
const HOUR_WORDS = new Set(["hora", "horas"]);

/** Accent-, case- and space-insensitive key for a category name. */
function channelKey(name: string): string {
  return normalizeWord(name).replace(/[^\p{L}\p{N}]/gu, "");
}

function findChannel(
  query: string,
  channels: readonly { id: string; name: string }[],
): string | undefined {
  const q = channelKey(query);
  if (!q) return undefined;
  const exact = channels.find((c) => channelKey(c.name) === q);
  if (exact) return exact.id;
  // "#trab" → "Trabajo", but only when it can't mean two categories.
  const prefixed = channels.filter((c) => channelKey(c.name).startsWith(q));
  return q.length >= 2 && prefixed.length === 1 ? prefixed[0].id : undefined;
}

export function parseQuickAdd(text: string, opts: QuickAddOptions): QuickAddResult {
  const { today, channels = [] } = opts;
  const ignore = new Set(opts.ignore ?? []);
  const tokens: Token[] = [...text.matchAll(/\S+/g)].map((m) => ({
    raw: m[0],
    norm: normalizeWord(m[0]),
    start: m.index,
    end: m.index + m[0].length,
  }));

  const result: QuickAddResult = { title: "", matches: [] };
  const used = new Set<number>();
  const n = (i: number) => (used.has(i) ? undefined : tokens[i]?.norm);

  function take(kind: QuickAddKind, from: number, to: number) {
    for (let i = from; i <= to; i++) used.add(i);
    result.matches.push({
      kind,
      text: text.slice(tokens[from].start, tokens[to].end),
      start: tokens[from].start,
      end: tokens[to].end,
    });
  }
  const want = (kind: QuickAddKind) =>
    !ignore.has(kind) && !result.matches.some((m) => m.kind === kind);

  for (let i = 0; i < tokens.length; i++) {
    const t = n(i);
    if (t === undefined) continue;

    // ---- priority: !alta / !media / !baja
    if (t.startsWith("!") && PRIORITIES[t.slice(1)] && want("priority")) {
      result.priority = PRIORITIES[t.slice(1)];
      take("priority", i, i);
      continue;
    }

    // ---- category: #casa (left in the title when no category matches)
    if (t.startsWith("#") && want("channel")) {
      const id = findChannel(t.slice(1), channels);
      if (id) {
        result.channelId = id;
        take("channel", i, i);
        continue;
      }
    }

    // ---- date
    if (want("date")) {
      const lead = DATE_LEADS.has(t) ? 1 : 0;
      const next = n(i + lead);
      let date: DayISO | null = null;
      let span = 0; // tokens after the first one that belong to the date

      if (t === "pasado" && n(i + 1) === "manana") {
        date = addDays(today, 2);
        span = 1;
      } else if (t === "hoy") {
        date = today;
      } else if (t === "manana") {
        // "a la mañana" / "esta mañana" is the morning, not tomorrow.
        const prev = n(i - 1);
        if (prev !== "la" && prev !== "esta") date = addDays(today, 1);
      } else if (next !== undefined && WEEKDAYS[next] !== undefined) {
        date = nextWeekday(today, WEEKDAYS[next]);
        span = lead;
      } else if (next !== undefined && readSlashDate(next, today)) {
        date = readSlashDate(next, today);
        span = lead;
      } else if (t === "el" && next !== undefined && /^\d{1,2}$/.test(next)) {
        date = nextDayOfMonth(today, Number(next));
        span = 1;
      }

      if (date) {
        result.plannedDate = date;
        take("date", i, i + span);
        i += span;
        continue;
      }
    }

    // ---- time of day
    if (want("time")) {
      let time: string | null = null;
      let span = 0;
      if (t === "a" && (n(i + 1) === "las" || n(i + 1) === "la") && n(i + 2) !== undefined) {
        // "a las 9", "a las 9:30", "a las 9 hs", "a las 9 pm"
        const suffix = n(i + 3);
        const unit = suffix === "hs" || suffix === "am" || suffix === "pm" ? suffix : undefined;
        time = readClock(n(i + 2)!, { allowBare: true, suffix: unit });
        span = unit ? 3 : 2;
      } else {
        const suffix = n(i + 1);
        if (
          /^\d{1,2}(:\d{2})?$/.test(t) &&
          (suffix === "hs" || suffix === "am" || suffix === "pm")
        ) {
          time = readClock(t, { allowBare: false, suffix }); // "18 hs", "9 pm"
          span = 1;
        } else {
          time = readClock(t, { allowBare: false });
        }
      }
      if (time) {
        result.time = time;
        take("time", i, i + span);
        i += span;
        continue;
      }
    }

    // ---- estimate: a token WITH a unit — a bare number is never a duration
    if (want("estimate")) {
      let span = 0;
      let source: string | null = null;
      if (DURATION_TOKEN.test(t)) {
        source = t;
        // "1h 30m" written as two tokens
        const more = n(i + 1);
        if (/h$/.test(t) && more !== undefined && MINUTES_TOKEN.test(more)) {
          source = `${t} ${more}`;
          span = 1;
        }
      } else if (/^\d+(?:[.,]\d+)?$/.test(t)) {
        const unit = n(i + 1);
        if (unit !== undefined && MINUTE_WORDS.has(unit)) source = `${t}m`;
        else if (unit !== undefined && HOUR_WORDS.has(unit)) source = `${t}h`;
        if (source) span = 1;
      }
      const minutes = source ? parseDuration(source.replace(",", ".")) : null;
      if (minutes) {
        result.estimateMin = Math.round(minutes);
        take("estimate", i, i + span);
        i += span;
        continue;
      }
    }
  }

  result.title = tokens
    .filter((_, i) => !used.has(i))
    .map((t) => t.raw)
    .join(" ");
  result.matches.sort((a, b) => a.start - b.start);
  return result;
}
