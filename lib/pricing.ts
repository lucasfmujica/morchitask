/**
 * The price, in one place.
 *
 * The marketing pages state these numbers and the billing integration will
 * charge them. Two copies of a price is how a page ends up advertising $10
 * while the checkout takes $12 — so the pages read from here, and when Fase 4
 * wires up the payment provider it reads from here too.
 *
 * The reasoning behind the numbers, from the launch plan:
 *
 * - **One plan.** Sharing with another person is included. With 8.5% of tasks
 *   actually shared in two months of real use, a "couples" tier would be a
 *   product nobody asked for.
 * - **$10, not $5.** A daily planner has the highest switching cost of any
 *   software — you are asking someone to put their whole day inside it. Next
 *   to Sunsama at $20, five dollars doesn't read as value, it reads as "weekend
 *   project that won't exist in a year", which is the exact fear that stops the
 *   migration. Half of Sunsama is a legible, credible gap.
 * - **No free tier.** Supporting a user costs the same at $5 as at $10, and the
 *   scarce input here is one person's weekends.
 */

export const PRICE_MONTHLY_USD = 10;

/** Two months free, which is the usual shape and makes the saving obvious. */
export const PRICE_YEARLY_USD = 80;

export const TRIAL_DAYS = 14;

/** What the yearly plan saves, as a percentage — derived so it can't drift. */
export const YEARLY_SAVING_PCT = Math.round(
  (1 - PRICE_YEARLY_USD / (PRICE_MONTHLY_USD * 12)) * 100,
);

/** The number the comparison copy leans on. Not a competitor's live price —
 *  a reference point, and one to re-check before it goes in an ad. */
export const SUNSAMA_MONTHLY_USD = 20;

/**
 * The price as it is written.
 *
 * Currency formatting is locale-dependent — "$10" in the US, "10 €" in much of
 * Europe — so it belongs in one function rather than as a bare `$` typed next
 * to a number in JSX. Today there is one currency and this is trivial; the
 * point is that when there are two, there is one place to change.
 */
export function formatUsd(amount: number): string {
  return `$${amount}`;
}
