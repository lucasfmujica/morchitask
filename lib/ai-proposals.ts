/**
 * The pure half of the Claude helpers: the shapes we ask the model for, the
 * shapes the UI sends us, and the functions that turn a model's answer into
 * something safe to apply. No SDK import here on purpose — the plan view
 * imports these types, and the Anthropic client must never reach the browser.
 *
 * Rule of thumb: the model *proposes*, these functions *decide*. Nothing the
 * model returns is trusted until it's been through here.
 */
import { z } from "zod";
import { freeSlots, type BusyRange } from "@/lib/scheduling";

// ------------------------------------------------------------ breakdown

/** What we ask Claude for when breaking a task down. Kept structurally plain:
 *  structured outputs don't reliably honour min/max items, so the counts are
 *  enforced in `cleanBreakdown` instead. */
export const BreakdownOutput = z.object({
  items: z.array(z.string()),
});

export const BREAKDOWN_MIN_ITEMS = 3;
export const BREAKDOWN_MAX_ITEMS = 8;
const ITEM_MAX_CHARS = 120;

export const BreakdownInput = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(4000).nullish(),
  existing: z.array(z.string().max(300)).max(50).default([]),
});
export type BreakdownInput = z.infer<typeof BreakdownInput>;

/**
 * Tidy the model's checklist: trim, strip list markers ("1.", "-", "•"),
 * drop blanks and anything already on the checklist (case-insensitive), dedupe,
 * cap each item's length and the total count.
 */
export function cleanBreakdown(
  items: readonly string[],
  existing: readonly string[] = [],
): string[] {
  const seen = new Set(existing.map(normalize));
  const out: string[] = [];
  for (const raw of items) {
    const text = raw
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, ITEM_MAX_CHARS)
      .trim();
    if (!text) continue;
    const key = normalize(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= BREAKDOWN_MAX_ITEMS) break;
  }
  return out;
}

function normalize(s: string): string {
  return s.trim().toLocaleLowerCase("es");
}

// ------------------------------------------------------------ plan my day

const Minute = z
  .number()
  .int()
  .min(0)
  .max(24 * 60);

/** The day as the plan view sees it, sent to the server action. Capped so a
 *  tampered request can't turn into a huge prompt. */
export const PlanInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        title: z.string().max(200),
        remainingMin: z
          .number()
          .int()
          .min(0)
          .max(24 * 60),
      }),
    )
    .max(40),
  busy: z.array(z.object({ startMin: Minute, endMin: Minute })).max(100),
  fromMin: Minute,
  toMin: Minute,
  /** Capacity minus what's already booked for this person's tasks. */
  capacityLeftMin: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
});
export type PlanInput = z.infer<typeof PlanInput>;

/** What we ask Claude for: tasks by their small index in the prompt (not
 *  UUIDs — easier for the model, and an invented index is simply dropped),
 *  start as "HH:MM", and a length in minutes. */
export const PlanOutput = z.object({
  blocks: z.array(
    z.object({
      task: z.number().int(),
      start: z.string(),
      durationMin: z.number().int(),
    }),
  ),
  note: z.string(),
});
export type PlanOutput = z.infer<typeof PlanOutput>;

/** One block the UI can create as-is. */
export type PlacedBlock = { taskId: string; startMin: number; endMin: number };

export type PlanProposal = {
  blocks: PlacedBlock[];
  /** Tasks Claude proposed that we couldn't fit (no room left before `toMin`). */
  skippedTaskIds: string[];
  /** Claude's one-line rationale, trimmed. */
  note: string;
};

/** Shortest block worth creating, and the grid blocks snap to. */
export const PLAN_MIN_BLOCK_MIN = 15;
const SNAP_MIN = 5;

/** "09:30" → 570. Null for anything that isn't a valid clock time. */
export function parseClock(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Turn Claude's proposed schedule into blocks that are guaranteed not to
 * overlap anything already in the day, each other, or the window
 * [`fromMin`, `toMin`).
 *
 * For each proposed block, in Claude's order:
 * - unknown task index, a task with nothing left to schedule, or a task already
 *   placed → ignored (one block per task per proposal);
 * - duration clamped to [15 min, what's left of the task], snapped to 5 min;
 * - if it fits where Claude put it, keep it; otherwise slide it to the first
 *   opening at/after that time, then anywhere in the window; if nothing fits,
 *   it's reported as skipped;
 * - stop adding once the new blocks would exceed `capacityMin` minus what's
 *   already booked.
 */
export function validatePlan(
  output: PlanOutput,
  ctx: {
    tasks: readonly { id: string; remainingMin: number }[];
    busy: readonly BusyRange[];
    fromMin: number;
    toMin: number;
    /** Minutes the person is still willing to add today (capacity − booked). */
    capacityLeftMin: number;
  },
): PlanProposal {
  const working: BusyRange[] = [...ctx.busy];
  const placed: PlacedBlock[] = [];
  const skipped: string[] = [];
  const used = new Set<string>();
  const fromMin = ceilTo(ctx.fromMin, SNAP_MIN);
  let budget = Math.max(0, ctx.capacityLeftMin);

  for (const b of output.blocks) {
    const task = ctx.tasks[b.task];
    if (!task || used.has(task.id)) continue;
    used.add(task.id);
    if (task.remainingMin < PLAN_MIN_BLOCK_MIN) continue;

    let dur = Math.round(b.durationMin / SNAP_MIN) * SNAP_MIN;
    dur = Math.min(task.remainingMin, Math.max(PLAN_MIN_BLOCK_MIN, dur));
    if (dur > budget) {
      // Out of capacity: a shorter block is still useful if it's meaningful.
      if (budget < PLAN_MIN_BLOCK_MIN) {
        skipped.push(task.id);
        continue;
      }
      dur = Math.floor(budget / SNAP_MIN) * SNAP_MIN;
    }

    const wanted = parseClock(b.start);
    const start = placeAt(working, dur, wanted, fromMin, ctx.toMin);
    if (start == null) {
      skipped.push(task.id);
      continue;
    }
    placed.push({ taskId: task.id, startMin: start, endMin: start + dur });
    working.push({ startMin: start, endMin: start + dur });
    budget -= dur;
  }

  placed.sort((a, b) => a.startMin - b.startMin);
  return { blocks: placed, skippedTaskIds: skipped, note: output.note.trim().slice(0, 300) };
}

/** Where a block of `dur` goes: at `wanted` if it fits, else the first
 *  opening after it, else the first opening in the window. */
function placeAt(
  busy: readonly BusyRange[],
  dur: number,
  wanted: number | null,
  fromMin: number,
  toMin: number,
): number | null {
  // Every slot here is at least `dur` long.
  const slots = freeSlots(busy, fromMin, toMin, dur);
  if (wanted != null) {
    const w = Math.max(fromMin, roundTo(wanted, SNAP_MIN));
    for (const s of slots) {
      if (w >= s.startMin && w + dur <= s.startMin + s.lenMin) return w; // fits where asked
      if (s.startMin >= w) return s.startMin; // first opening after the asked time
    }
  }
  return slots.at(0)?.startMin ?? null;
}

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}
function ceilTo(n: number, step: number) {
  return Math.ceil(n / step) * step;
}

// ------------------------------------------------------------ usage limit

/**
 * A tiny per-person daily counter. Returns true (and counts the call) when
 * `key` is still under `limit`; false once it's used up.
 *
 * The store is whatever Map the caller keeps — in production that's
 * module-level memory, so it resets when the server restarts. Good enough as a
 * guard against a stuck button or a runaway loop; not a billing control.
 */
export function consumeQuota(store: Map<string, number>, key: string, limit: number): boolean {
  const used = store.get(key) ?? 0;
  if (used >= limit) return false;
  store.set(key, used + 1);
  return true;
}
