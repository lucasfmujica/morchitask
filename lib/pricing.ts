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
 *   to Sunsama at $22, five dollars doesn't read as value, it reads as "weekend
 *   project that won't exist in a year", which is the exact fear that stops the
 *   migration. Less than half of Sunsama is a legible, credible gap.
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
 *  a reference point, and one to re-check before it goes in an ad. It was $20
 *  until Sunsama raised it; the copy said "half" and "twice" back then, and
 *  both went quietly false the day they did. The copy now only claims what
 *  `pricing.test.ts` checks against these numbers. */
export const SUNSAMA_MONTHLY_USD = 22;

/** Sunsama billed yearly, per month. The fair comparison for our yearly plan:
 *  setting our yearly price against their monthly one would flatter us. */
export const SUNSAMA_YEARLY_PER_MONTH_USD = 17;

/**
 * The yearly plan, per month, as the copy quotes it ("about US$6.70 a month").
 *
 * Rounded to ten cents because every place that shows it says "about", and an
 * exact 6.67 next to "about" reads like a calculator. One function because the
 * billing screen used to round it on its own, to whole dollars, and said "about
 * $7" while /pricing said "about US$6.70" for the same plan.
 */
export function yearlyPerMonthUsd(): number {
  return Math.round((PRICE_YEARLY_USD / 12) * 10) / 10;
}

/**
 * The price as it is written: "US$10", "US$6,70" in Spanish, "US$6.70" in
 * English.
 *
 * "US$" and never a bare "$": the people using this are in Argentina, where
 * "$10" reads as ten pesos. It used to return "$10", and the app's billing
 * screen showed exactly that while /pricing said "US$10". The prefix is the
 * same in both languages because the currency is; only the decimal separator
 * follows the locale. Whole amounts get no decimals ("US$10", not "US$10,00"),
 * a fractional one always gets two, because "US$6,7" looks like a typo.
 */
export function formatUsd(amount: number, locale: string): string {
  const whole = Number.isInteger(amount);
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
  return `US$${number}`;
}
