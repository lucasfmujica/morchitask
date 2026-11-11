import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dayISOInTimeZone, DEFAULT_TIMEZONE, type DayISO } from "@/lib/date";
import {
  PERIODS,
  isPaying,
  monthlyRecurringRevenue,
  summarizeFunnel,
  type HouseholdFunnelFacts,
  type Period,
  type PeriodFunnel,
} from "@/lib/funnel";
import { CUT_DAY, LAUNCH_TOTAL_DAYS, PAYMENTS_TARGET, launchDayNumber } from "@/lib/launch";

/**
 * THE ONLY CROSS-HOUSEHOLD READS IN THE APP.
 *
 * Every other query takes a `householdId` from the session and never looks
 * past it (CLAUDE.md, and `isolation.test.ts` checks it). These two cannot:
 * a launch funnel is by definition a count across everybody. They exist for
 * `/admin/metrics`, which only an allowlisted admin can open.
 *
 * So the rule here is different, and stricter in its own way: what leaves this
 * module is aggregate counts and calendar dates, nothing else. No ids, names,
 * emails, task titles, or anyone's minutes. Even internally the SQL selects no
 * identifier: each row is a set of dates and statuses that could belong to
 * anyone, folded into totals before the function returns.
 * `admin-metrics.test.ts` walks the returned object and fails on anything that
 * is not a number or a date.
 *
 * Nothing is exported that returns rows. If you need a new number, add it to
 * the aggregate; do not export a per-household helper "just for the page".
 */

export type LaunchMetrics = {
  /** Today in Buenos Aires, the day the numbers were computed for. */
  today: DayISO;
  funnel: Record<Period, PeriodFunnel>;
  revenue: {
    /** At list price, in whole dollars. */
    mrrUsd: number;
    payingMonthly: number;
    payingYearly: number;
  };
  cut: {
    cutDay: DayISO;
    day: number;
    totalDays: number;
    payments: number;
    target: number;
  };
};

/** Postgres instants rendered as ISO 8601 in UTC, so both drivers (Neon hands
 *  back strings, pglite hands back Dates) give the same thing. */
const ISO = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS"Z"'`);

/**
 * One row per household on a trial, without the household.
 *
 * Comped households are left out: they never had a trial and never will pay,
 * and counting the two accounts that predate billing as "trials that didn't
 * convert" would make the funnel lie from day one.
 *
 * Activity days are bounded to a few days around sign-up in SQL (the exact
 * seven-day window is applied in `lib/funnel.ts`, in the household's own
 * timezone) so the read does not grow with how long people have used the app.
 */
async function householdFacts(): Promise<HouseholdFunnelFacts[]> {
  const result = await db.execute(sql`
    select
      to_char(h.created_at at time zone 'UTC', ${ISO}) as created_at,
      h.timezone as timezone,
      to_char(h.trial_ends_at at time zone 'UTC', ${ISO}) as trial_ends_at,
      s.status as status,
      coalesce(s.cancel_at_period_end, false) as cancel_at_period_end,
      exists (
        select 1 from profiles p
        where p.household_id = h.id
          and p.notification_prefs ->> 'checkout_started_at' is not null
      ) as checkout_started,
      array(
        select distinct to_char(te.day, 'YYYY-MM-DD')
        from task_time_entries te
        where te.household_id = h.id
          and te.minutes > 0
          and te.day between (h.created_at at time zone 'UTC')::date - 1
                         and (h.created_at at time zone 'UTC')::date + 8
      ) as tracked_days,
      array(
        select distinct to_char(dn.note_date, 'YYYY-MM-DD')
        from daily_notes dn
        where dn.household_id = h.id
          and dn.shutdown_completed_at is not null
          and dn.note_date between (h.created_at at time zone 'UTC')::date - 1
                               and (h.created_at at time zone 'UTC')::date + 8
      ) as closed_days
    from households h
    left join subscriptions s on s.household_id = h.id
    where h.trial_ends_at is not null
      and h.plan_override is distinct from 'comp'
  `);

  return (result.rows as Record<string, unknown>[]).map((r) => ({
    signupDay: dayISOInTimeZone(
      new Date(String(r.created_at)),
      typeof r.timezone === "string" ? r.timezone : DEFAULT_TIMEZONE,
    ),
    trialEndsAt: typeof r.trial_ends_at === "string" ? r.trial_ends_at : null,
    subscriptionStatus: typeof r.status === "string" ? r.status : null,
    cancelAtPeriodEnd: r.cancel_at_period_end === true,
    checkoutStarted: r.checkout_started === true,
    trackedDays: (r.tracked_days as string[] | null) ?? [],
    closedDays: (r.closed_days as string[] | null) ?? [],
  }));
}

/** Subscriptions bringing in money now, by billing period. Every household,
 *  comped or not: if a comped account chose to pay, that money is real. */
async function payingCounts(): Promise<{ monthly: number; yearly: number }> {
  const result = await db.execute(sql`
    select recurring_interval as interval, status, count(*)::int as n
    from subscriptions
    group by recurring_interval, status
  `);
  const counts = { monthly: 0, yearly: 0 };
  for (const r of result.rows as { interval: string | null; status: string; n: number }[]) {
    if (!isPaying(r.status)) continue;
    if (r.interval === "year") counts.yearly += Number(r.n);
    else counts.monthly += Number(r.n);
  }
  return counts;
}

/**
 * Everything `/admin/metrics` shows, for all three periods at once.
 *
 * All three are computed here so the page can switch periods without another
 * round trip, and so there is no server action a client could call with a
 * period of its own choosing.
 */
export async function launchMetrics(now: Date = new Date()): Promise<LaunchMetrics> {
  const today = dayISOInTimeZone(now, DEFAULT_TIMEZONE);
  const [facts, paying] = await Promise.all([householdFacts(), payingCounts()]);

  const funnel = Object.fromEntries(
    PERIODS.map((p) => [p, summarizeFunnel(facts, p, today, now)]),
  ) as Record<Period, PeriodFunnel>;

  return {
    today,
    funnel,
    revenue: {
      mrrUsd: Math.round(monthlyRecurringRevenue(paying)),
      payingMonthly: paying.monthly,
      payingYearly: paying.yearly,
    },
    cut: {
      cutDay: CUT_DAY,
      day: launchDayNumber(today),
      totalDays: LAUNCH_TOTAL_DAYS,
      payments: paying.monthly + paying.yearly,
      target: PAYMENTS_TARGET,
    },
  };
}
