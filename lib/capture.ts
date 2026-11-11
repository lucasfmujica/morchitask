import { z } from "zod";
import { addDays, type DayISO } from "@/lib/date";
import { normalizeWord, parseQuickAdd } from "@/lib/quick-add";
import type { TaskPriority } from "@/lib/priority";

/**
 * Dictation capture: "mañana a las 10 llamo al contador, media hora; el jueves
 * turno con la dentista" → several tasks, each with what it said about when and
 * how long.
 *
 * The pure half, like `ai-proposals.ts`: the shape we ask Claude for, the shape
 * the screen sends, and the function that decides what of the model's answer is
 * safe to show. No SDK import here — the capture sheet imports these types.
 *
 * Without Claude (no key, quota, an outage) `splitDictation` still turns the
 * text into tasks by cutting it into phrases and running each through the
 * composer's own parser. Worse at "media hora", never worse than nothing.
 */

export const CAPTURE_MAX_ITEMS = 10;
const TITLE_MAX_CHARS = 140;
/** A date further out than this is almost certainly a misheard year. */
const MAX_DAYS_AHEAD = 365;

export const CaptureInput = z.object({
  text: z.string().trim().min(1).max(4000),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  channels: z.array(z.string().max(80)).max(50).default([]),
});
export type CaptureInput = z.infer<typeof CaptureInput>;

/** What we ask Claude for. Plain on purpose; the rules are enforced below. */
export const CaptureOutput = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      date: z.string().nullable(),
      time: z.string().nullable(),
      estimateMin: z.number().nullable(),
      priority: z.enum(["high", "medium", "low"]).nullable(),
      category: z.string().nullable(),
    }),
  ),
});
export type CaptureOutput = z.infer<typeof CaptureOutput>;

/** One proposed task, in the composer's own vocabulary. */
export type CapturedTask = {
  title: string;
  plannedDate: DayISO | null;
  time: string | null;
  estimateMin: number | null;
  priority: TaskPriority | null;
  /** The category's name as the person has it, matched case/accent-blind. */
  channelName: string | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

function matchChannel(name: string | null, channels: readonly string[]): string | null {
  if (!name) return null;
  const want = normalizeWord(name.trim());
  return channels.find((c) => normalizeWord(c.trim()) === want) ?? null;
}

/**
 * Keep only what we can stand behind: a title, a real day between today and a
 * year out, a valid clock, an estimate between 5 minutes and 10 hours, a
 * category the person actually has. Anything else becomes null rather than a
 * guess, and the task still goes through.
 */
export function cleanCapture(
  output: CaptureOutput,
  opts: { today: DayISO; channels: readonly string[] },
): CapturedTask[] {
  const last = addDays(opts.today, MAX_DAYS_AHEAD);
  const seen = new Set<string>();
  const out: CapturedTask[] = [];
  for (const t of output.tasks) {
    const title = t.title.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX_CHARS);
    if (!title) continue;
    const key = normalizeWord(title);
    if (seen.has(key)) continue;
    seen.add(key);

    const date =
      t.date && ISO_DAY.test(t.date) && t.date >= opts.today && t.date <= last ? t.date : null;
    const time = t.time && CLOCK.test(t.time) ? t.time : null;
    const est =
      t.estimateMin != null && Number.isFinite(t.estimateMin) ? Math.round(t.estimateMin) : null;

    out.push({
      title: title.charAt(0).toUpperCase() + title.slice(1),
      plannedDate: date,
      time,
      estimateMin: est != null && est >= 5 && est <= 600 ? est : null,
      priority: t.priority,
      channelName: matchChannel(t.category, opts.channels),
    });
    if (out.length >= CAPTURE_MAX_ITEMS) break;
  }
  return out;
}

/** Where one dictated thought ends and the next begins. */
const BREAKS = /(?:[.;!?\n]+|,?\s+y\s+(?:despu[eé]s|tambi[eé]n|adem[aá]s)\s+|,?\s+and\s+then\s+)/i;

/**
 * The no-Claude path: split into phrases, parse each with the quick-add parser.
 * Phrases shorter than two characters (a stray "y") are dropped.
 */
export function splitDictation(
  text: string,
  opts: { today: DayISO; channels: readonly { id: string; name: string }[] },
): CapturedTask[] {
  const out: CapturedTask[] = [];
  for (const phrase of text.split(BREAKS)) {
    const trimmed = phrase.trim().replace(/^(y|and)\s+/i, "");
    if (trimmed.length < 2) continue;
    const r = parseQuickAdd(trimmed, { today: opts.today, channels: opts.channels });
    const title = r.title.trim();
    if (!title) continue;
    out.push({
      title: title.charAt(0).toUpperCase() + title.slice(1),
      plannedDate: r.plannedDate ?? null,
      time: r.time ?? null,
      estimateMin: r.estimateMin ?? null,
      priority: r.priority ?? null,
      channelName: r.channelId
        ? (opts.channels.find((c) => c.id === r.channelId)?.name ?? null)
        : null,
    });
    if (out.length >= CAPTURE_MAX_ITEMS) break;
  }
  return out;
}
