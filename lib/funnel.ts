import { PRICE_MONTHLY_USD, PRICE_YEARLY_USD } from "@/lib/pricing";
import { LAUNCH_DAY } from "@/lib/launch";
import { addDays, weekRange, type DayISO } from "@/lib/date";

/**
 * The launch funnel, as pure arithmetic over anonymous facts.
 *
 * The unit is the household, because that is what starts a trial and what
 * pays (see `households.trial_ends_at` and `subscriptions`): someone invited
 * into an existing space did not sign up for anything. Activity from either
 * person in the space counts towards activating it.
 *
 * Nothing in here knows who anyone is. The query that feeds it selects dates
 * and statuses only, and what comes out is counts.
 */

/** How long after sign-up activation is judged. */
export const ACTIVATION_WINDOW_DAYS = 7;

/** How many of those days need tracked time. */
export const ACTIVATION_MIN_DAYS = 3;

/**
 * Whether a household got real use out of its first week.
 *
 * Either three distinct days with tracked time (`task_time_entries.minutes >
 * 0`) or a single closed day (`daily_notes.shutdown_completed_at`) inside the
 * first seven. One close is enough on its own: closing a day means going
 * through the whole loop (plan, work, review), which tracking alone does not.
 *
 * Deliberately not "planned days": one of the two people who have used the app
 * daily for months tracks everything and barely plans, and a definition that
 * called them inactive would be measuring the wrong habit.
 *
 * Sign-up day is day one, so the window is `signupDay` through `signupDay + 6`.
 */
export function isActivated(f: {
  signupDay: DayISO;
  trackedDays: readonly DayISO[];
  closedDays: readonly DayISO[];
}): boolean {
  const last = addDays(f.signupDay, ACTIVATION_WINDOW_DAYS - 1);
  const inWindow = (d: DayISO) => d >= f.signupDay && d <= last;
  if (f.closedDays.some(inWindow)) return true;
  return new Set(f.trackedDays.filter(inWindow)).size >= ACTIVATION_MIN_DAYS;
}

/** Statuses that mean the household paid at least once. `incomplete` and its
 *  expiry never charged anything; `trialing` would be Polar's own trial, which
 *  this app does not use. */
const PAID_STATUSES = new Set(["active", "past_due", "canceled", "unpaid", "paused"]);

/** Statuses that are bringing in money right now. `past_due` stays in: Polar
 *  is still retrying the card, and most of those recover. */
const PAYING_STATUSES = new Set(["active", "past_due"]);

export type HouseholdFunnelFacts = {
  /** Sign-up day in the household's own timezone. */
  signupDay: DayISO;
  /** ISO instant. */
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  checkoutStarted: boolean;
  trackedDays: DayISO[];
  closedDays: DayISO[];
};

export function hasPaid(f: Pick<HouseholdFunnelFacts, "subscriptionStatus">): boolean {
  return f.subscriptionStatus !== null && PAID_STATUSES.has(f.subscriptionStatus);
}

export function isPaying(status: string | null): boolean {
  return status !== null && PAYING_STATUSES.has(status);
}

/** Left, or on the way out: ended, or set to stop at the end of the period. */
export function hasChurned(
  f: Pick<HouseholdFunnelFacts, "subscriptionStatus" | "cancelAtPeriodEnd">,
): boolean {
  if (f.subscriptionStatus === "canceled" || f.subscriptionStatus === "unpaid") return true;
  return isPaying(f.subscriptionStatus) && f.cancelAtPeriodEnd;
}

export const PERIODS = ["week", "launch", "all"] as const;
export type Period = (typeof PERIODS)[number];

/** First sign-up day a period includes, or null for no lower bound. */
export function periodStart(period: Period, today: DayISO): DayISO | null {
  if (period === "week") return addDays(today, -6);
  if (period === "launch") return LAUNCH_DAY;
  return null;
}

export type CohortWeek = {
  /** Monday of the sign-up week. */
  weekStart: DayISO;
  signups: number;
  activated: number;
  paid: number;
};

export type PeriodFunnel = {
  trials: number;
  activated: number;
  checkout: number;
  paid: number;
  churned: number;
  expiredUnpaid: number;
  weeks: CohortWeek[];
};

/**
 * The funnel for everyone who signed up in `period`.
 *
 * Cohort-based on purpose: each step counts the same households as the step
 * before it, so "activated" means "of those who signed up in this period", not
 * "anyone who happened to be active in it". Otherwise a quiet week after a busy
 * one would show more activations than sign-ups.
 *
 * Someone with a subscription went through checkout even if they did it before
 * checkout starts were recorded, so they count there too.
 */
export function summarizeFunnel(
  facts: readonly HouseholdFunnelFacts[],
  period: Period,
  today: DayISO,
  now: Date,
): PeriodFunnel {
  const start = periodStart(period, today);
  const cohort = facts.filter(
    (f) => (start === null || f.signupDay >= start) && f.signupDay <= today,
  );

  const byWeek = new Map<DayISO, CohortWeek>();
  let activated = 0;
  let checkout = 0;
  let paid = 0;
  let churned = 0;
  let expiredUnpaid = 0;

  for (const f of cohort) {
    const a = isActivated(f);
    const p = hasPaid(f);
    if (a) activated++;
    if (p) paid++;
    if (p || f.checkoutStarted) checkout++;
    if (hasChurned(f)) churned++;
    if (!p && f.trialEndsAt && new Date(f.trialEndsAt).getTime() <= now.getTime()) {
      expiredUnpaid++;
    }

    const weekStart = weekRange(f.signupDay, 1)[0];
    const w = byWeek.get(weekStart) ?? { weekStart, signups: 0, activated: 0, paid: 0 };
    w.signups++;
    if (a) w.activated++;
    if (p) w.paid++;
    byWeek.set(weekStart, w);
  }

  const weeks = [...byWeek.values()].sort((x, y) => x.weekStart.localeCompare(y.weekStart));
  return { trials: cohort.length, activated, checkout, paid, churned, expiredUnpaid, weeks };
}

/**
 * Monthly recurring revenue at list price.
 *
 * List price, not what Polar actually charged: a discount code would make this
 * read high. Fine for a launch with no discounts; revisit if there ever are.
 */
export function monthlyRecurringRevenue(paying: { monthly: number; yearly: number }): number {
  return paying.monthly * PRICE_MONTHLY_USD + (paying.yearly * PRICE_YEARLY_USD) / 12;
}

/** Whole-percent conversion from the previous step, or null when the previous
 *  step is empty and a percentage would be a division by zero. */
export function stepConversion(n: number, previous: number): number | null {
  return previous > 0 ? Math.round((n / previous) * 100) : null;
}
