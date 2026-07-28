import { pointerWithin, type CollisionDetection } from "@dnd-kit/core";

/**
 * Pointer-first collision detection with an explicit escalation order:
 *
 *   hard targets (e.g. the agenda's `slot-*`) → any card under the pointer →
 *   a priority group strip → the view's default strategy.
 *
 * Group strips are thin bands sitting right against the cards, so a plain
 * distance-based strategy would let one steal a drop from the card the pointer
 * is actually on. Checking them last makes them a fallback, not a competitor.
 */
export function createTaskCollision({
  hardPrefixes = [],
  fallback,
}: {
  hardPrefixes?: string[];
  fallback: CollisionDetection;
}): CollisionDetection {
  const isHard = (id: string) => hardPrefixes.some((p) => id.startsWith(p));
  return (args) => {
    const hits = pointerWithin(args);
    const hard = hits.find((h) => isHard(String(h.id)));
    if (hard) return [hard];

    const card = hits.find((h) => {
      const id = String(h.id);
      return !id.startsWith("prio::") && !isHard(id);
    });
    if (card) return fallback(args);

    const group = hits.find((h) => String(h.id).startsWith("prio::"));
    if (group) return [group];

    return fallback(args);
  };
}
