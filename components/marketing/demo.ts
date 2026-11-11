/**
 * Sample data the landing's illustrations are drawn with.
 *
 * Category colours are user data in the product (a column on each category
 * row, painted with an inline style), not theme tokens, so the demo paints
 * them the same way. These three are the canvas's sample categories.
 */
export const DEMO_CATEGORY_COLORS = {
  work: "#3f4f86",
  home: "#c2532a",
  personal: "#1f7a69",
} as const;

/** One day of sample numbers, in minutes, shared by the strip and the ritual. */
export const DEMO_DAY = {
  capacityMin: 420,
  plannedStripMin: 280,
  plannedRitualMin: 340,
  doneStrip: 3,
  totalStrip: 6,
  doneClose: 6,
  totalClose: 8,
  byCategoryMin: { work: 210, home: 70, personal: 60 },
} as const;

/** A circle's circumference, for stroke-dasharray rings. */
export const circumference = (r: number) => 2 * Math.PI * r;
