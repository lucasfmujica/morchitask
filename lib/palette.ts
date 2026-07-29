import type { Task } from "@/lib/queries/types";

/**
 * Matching and layout for the ⌘K palette.
 *
 * Kept free of React and of the DB so it can be tested directly. The server
 * does a broad ILIKE (recall); everything here is the precision half — ranking
 * results, filtering navigation actions, and laying the two out as one list.
 */

/** Max task results shown, so navigation actions never get pushed off-screen. */
export const MAX_TASK_RESULTS = 8;
/** Max entries in the "Recientes" section shown on an empty query. */
export const MAX_RECENTS = 5;

/**
 * Fold a string for comparison: lowercase and strip diacritics.
 *
 * Non-negotiable in a Spanish UI — plain `includes()` meant "mama" never found
 * "mamá" and "revision" never found "revisión", which is most of why the old
 * palette felt broken.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** A [start, end) slice of the ORIGINAL (un-normalized) string that matched. */
export type MatchRange = [number, number];

export type Match = { score: number; ranges: MatchRange[] };

/** Merge touching/overlapping ranges so the highlighter never double-wraps. */
function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length === 0) return ranges;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: MatchRange[] = [sorted[0]];
  for (const [start, end] of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Score `text` against `query`, returning null when it doesn't match at all.
 *
 * Tiers, strongest first: prefix of the whole string, start of any word,
 * contiguous substring, then scattered subsequence. Shorter texts win ties, so
 * "Pagar luz" outranks "Pagar la factura de luz del departamento" for "luz".
 *
 * NFD normalization can change string length (a precomposed "á" becomes two
 * code points), so ranges are computed against a length-preserving fold — the
 * indexes stay valid on the original text.
 */
export function fuzzyMatch(text: string, query: string): Match | null {
  const q = normalize(query.trim());
  if (!q) return { score: 0, ranges: [] };

  // Fold per character so index i of `haystack` still maps to index i of `text`.
  const haystack = [...text].map((char) => normalize(char) || char).join("");
  if (haystack.length !== text.length) {
    // A character folded to more/less than one char (rare). Fall back to a
    // plain lowercase compare rather than emit wrong highlight ranges.
    return fuzzyMatchSimple(text, q);
  }

  const exact = haystack.indexOf(q);
  if (exact !== -1) {
    const ranges: MatchRange[] = [[exact, exact + q.length]];
    const atStart = exact === 0;
    const atWord = atStart || /[\s\-_/]/.test(haystack[exact - 1]);
    const base = atStart ? 1000 : atWord ? 800 : 600;
    return { score: base + lengthBonus(text), ranges };
  }

  // Subsequence: every query char in order, not necessarily adjacent.
  const ranges: MatchRange[] = [];
  let cursor = 0;
  for (const char of q) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return null;
    ranges.push([found, found + 1]);
    cursor = found + 1;
  }
  return { score: 300 + lengthBonus(text), ranges: mergeRanges(ranges) };
}

/** Shorter text is a better match for the same query. Always < tier spacing. */
function lengthBonus(text: string): number {
  return Math.max(0, 100 - text.length);
}

/** Fallback for strings whose folding changes length — score only, no ranges. */
function fuzzyMatchSimple(text: string, normalizedQuery: string): Match | null {
  const haystack = normalize(text);
  const at = haystack.indexOf(normalizedQuery);
  if (at === -1) return null;
  return { score: (at === 0 ? 1000 : 600) + lengthBonus(text), ranges: [] };
}

// ------------------------------------------------------------ palette items

export type ActionMeta = { id: string; label: string; run: () => void };

export type PaletteItem =
  | { kind: "action"; id: string; label: string; ranges: MatchRange[]; run: () => void }
  | { kind: "task"; id: string; task: Task; ranges: MatchRange[] }
  | { kind: "create"; id: "create"; title: string };

export type PaletteSection = { id: string; heading: string; items: PaletteItem[] };

/**
 * Penalty applied to an already-finished task.
 *
 * Smaller than the gap between match tiers (200), so a genuinely better match
 * still wins — searching the exact title of something you finished yesterday
 * still puts it on top. But when two results match equally well, the one you
 * still have to do comes first. Without this, a single pending task sat below
 * four completed ones, which is backwards for a planner.
 */
const DONE_PENALTY = 150;

function rank(entry: { task: Task; match: Match }): number {
  return entry.match.score - (entry.task.status === "done" ? DONE_PENALTY : 0);
}

/**
 * Build the palette's sections AND the flat list keyboard navigation walks.
 *
 * The two MUST stay in the same order — `flat` is what ArrowUp/Down index into,
 * and the sections are what gets rendered. Deriving both here (rather than
 * flattening in the component) is what guarantees they can't drift.
 */
export function buildPaletteItems(input: {
  query: string;
  actions: ActionMeta[];
  tasks: Task[];
  recents: Task[];
}): { sections: PaletteSection[]; flat: PaletteItem[] } {
  const query = input.query.trim();
  const sections: PaletteSection[] = [];

  if (!query) {
    // Resting state: what you were just working on, then where you can go.
    const recents = input.recents.slice(0, MAX_RECENTS);
    if (recents.length > 0) {
      sections.push({
        id: "recents",
        heading: "Recientes",
        items: recents.map((task) => ({ kind: "task", id: task.id, task, ranges: [] })),
      });
    }
    sections.push({
      id: "actions",
      heading: "Ir a",
      items: input.actions.map((action) => ({
        kind: "action",
        id: action.id,
        label: action.label,
        ranges: [],
        run: action.run,
      })),
    });
    return { sections, flat: sections.flatMap((section) => section.items) };
  }

  // Tasks first: every action label starts with "Ir a", so actions only surface
  // when you actually type a view name — they can't drown out task hits.
  const taskItems = input.tasks
    .map((task) => ({ task, match: fuzzyMatch(task.title, query) }))
    .filter((entry): entry is { task: Task; match: Match } => entry.match !== null)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, MAX_TASK_RESULTS)
    .map(
      ({ task, match }): PaletteItem => ({
        kind: "task",
        id: task.id,
        task,
        ranges: match.ranges,
      }),
    );
  if (taskItems.length > 0) {
    sections.push({ id: "tasks", heading: "Tareas", items: taskItems });
  }

  const actionItems = input.actions
    .map((action) => ({ action, match: fuzzyMatch(action.label, query) }))
    .filter((entry): entry is { action: ActionMeta; match: Match } => entry.match !== null)
    .sort((a, b) => b.match.score - a.match.score)
    .map(
      ({ action, match }): PaletteItem => ({
        kind: "action",
        id: action.id,
        label: action.label,
        ranges: match.ranges,
        run: action.run,
      }),
    );
  if (actionItems.length > 0) {
    sections.push({ id: "actions", heading: "Ir a", items: actionItems });
  }

  // Always last, always present: Enter on a partial view name still navigates
  // rather than silently creating a task called "sema".
  sections.push({
    id: "create",
    heading: "Crear",
    items: [{ kind: "create", id: "create", title: query }],
  });

  return { sections, flat: sections.flatMap((section) => section.items) };
}
