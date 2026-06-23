/**
 * Fractional ordering: place an item between two neighbours by taking the
 * midpoint of their sort_order values. Reordering touches a single row — no
 * bulk renumbering — which scales to long lists.
 */
const STEP = 1000;

export function orderBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return STEP;
  if (before === null) return after! - STEP;
  if (after === null) return before + STEP;
  return (before + after) / 2;
}

/** sort_order for a brand-new item appended to the end of `existing` (any order). */
export function orderForAppend(existing: number[]): number {
  if (existing.length === 0) return STEP;
  return Math.max(...existing) + STEP;
}

/** sort_order for an item dropped at index `to` within an ordered list. */
export function orderForIndex(orderedSortValues: number[], to: number): number {
  const before = to > 0 ? orderedSortValues[to - 1] : null;
  const after = to < orderedSortValues.length ? orderedSortValues[to] : null;
  return orderBetween(before, after);
}
