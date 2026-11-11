import { freeSlots, type BusyRange } from "@/lib/scheduling";
import type { PriorityKey } from "@/lib/priority";

/**
 * "Se me rompió el día": re-pack what's left of today from now on.
 *
 * Pure on purpose. The agenda feeds it minutes-from-midnight (it already owns
 * the timezone math) and gets back a plan it can preview before writing
 * anything. Nothing here touches the clock or the network, so every rule below
 * has a test next to it.
 *
 * The rules:
 * - Fixed things stay put: calendar events and blocks of tasks already done.
 *   They are the walls the rest is packed around.
 * - Everything else of mine that's still todo is movable: blocks that already
 *   slid into the past, the one that overlaps "now", and the ones still ahead
 *   (packing only the late ones around untouched future blocks leaves holes
 *   and puts the most urgent thing last).
 * - Time a task still needs but never got a block (estimate − scheduled) is
 *   movable too, so "Diseño de la home (resto)" finds its hour.
 * - Order: priority first, then whatever was supposed to happen earlier.
 *   Items are never split; what doesn't fit whole goes to `overflow` and the
 *   person decides where it lives.
 */

/** A piece of work to place: an existing block, or loose time with no block. */
export type ReplanItem = {
  taskId: string;
  /** The block being moved; null for time that never had a block. */
  blockId: string | null;
  durMin: number;
  /** Where it was before (null for loose time), for ordering and the preview. */
  fromStartMin: number | null;
  priority: PriorityKey;
  /** Tie-breaker after priority and original start: the list order. */
  sortOrder: number;
};

export type ReplanMove = ReplanItem & { startMin: number };

export type ReplanResult = {
  moves: ReplanMove[];
  overflow: ReplanItem[];
  /** Minutes free between `fromMin` and `toMin` once the walls are in. */
  freeMin: number;
  /** Minutes the movable items add up to. */
  neededMin: number;
};

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function rank(p: PriorityKey): number {
  return p == null ? 3 : PRIORITY_RANK[p];
}

/** Round up to the next multiple of `step` (a plan starting at 14:07 looks broken). */
export function roundUpTo(min: number, step = 15): number {
  return Math.ceil(min / step) * step;
}

function byUrgency(a: ReplanItem, b: ReplanItem): number {
  const pr = rank(a.priority) - rank(b.priority);
  if (pr !== 0) return pr;
  // Loose time (no original start) goes after anything that had a slot.
  const af = a.fromStartMin ?? Number.POSITIVE_INFINITY;
  const bf = b.fromStartMin ?? Number.POSITIVE_INFINITY;
  if (af !== bf) return af - bf;
  return a.sortOrder - b.sortOrder;
}

export function replanFromNow({
  items,
  fixed,
  fromMin,
  toMin,
}: {
  items: readonly ReplanItem[];
  fixed: readonly BusyRange[];
  /** Usually "now", already rounded with `roundUpTo`. */
  fromMin: number;
  /** End of the day the person set (the agenda's "Terminar a las"). */
  toMin: number;
}): ReplanResult {
  const ordered = items.filter((i) => i.durMin > 0).sort(byUrgency);
  const busy: BusyRange[] = fixed.map((r) => ({ ...r }));
  const freeMin = freeSlots(busy, fromMin, toMin, 1).reduce((s, slot) => s + slot.lenMin, 0);

  const moves: ReplanMove[] = [];
  const overflow: ReplanItem[] = [];
  for (const item of ordered) {
    const slot = freeSlots(busy, fromMin, toMin, item.durMin).at(0);
    if (!slot) {
      overflow.push(item);
      continue;
    }
    moves.push({ ...item, startMin: slot.startMin });
    busy.push({ startMin: slot.startMin, endMin: slot.startMin + item.durMin });
  }

  return {
    // Back in time order, which is how the preview reads it.
    moves: moves.sort((a, b) => a.startMin - b.startMin),
    overflow,
    freeMin,
    neededMin: ordered.reduce((s, i) => s + i.durMin, 0),
  };
}

/** A move that leaves a block exactly where it was isn't worth a write. */
export function isNoop(move: ReplanMove): boolean {
  return move.blockId != null && move.fromStartMin === move.startMin;
}
