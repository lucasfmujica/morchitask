import { TRIAL_DAYS } from "@/lib/pricing";

/**
 * Who gets into the app, and until when.
 *
 * Pure on purpose. This is the one decision in the codebase that can lock a
 * paying customer out of their own calendar, and it depends on four things that
 * are awkward to reproduce together — a clock, a webhook that may be late, a
 * card that may have failed, and a trial. Keeping it a function of its inputs
 * means every one of those combinations is a test rather than a situation you
 * discover from an angry email.
 *
 * The shape of the answer is a deadline, not a boolean: several things can
 * grant access at once (a comped household that also has a subscription, a
 * cancelled subscription still inside the period it paid for), and the honest
 * rule is that the most generous one wins. A boolean would make the order of
 * the `if`s load-bearing.
 */

/** Polar's vocabulary, mirrored so the rest of the app never imports the SDK. */
export const SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(v: unknown): v is SubscriptionStatus {
  return typeof v === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(v);
}

/**
 * How long access outlives the end of a paid period.
 *
 * A renewal is a webhook, and a webhook can be late, retried, or lost. Without
 * this, a customer whose card charged fine is locked out because a POST didn't
 * arrive — and they would be locked out at the exact moment they trusted the
 * app enough to pay for it. Two days is longer than any retry schedule and
 * short enough that a genuinely dead subscription doesn't linger.
 */
export const WEBHOOK_GRACE_DAYS = 2;

/**
 * How long a failed payment keeps access.
 *
 * Polar retries a declined card over about two weeks. Cutting someone off on
 * the first decline mostly punishes an expired card, which is the most common
 * and least deliberate reason to stop paying, and the person is usually still
 * planning their week while their bank sorts it out.
 */
export const DUNNING_GRACE_DAYS = 14;

export type BillingFacts = {
  /** Set by hand on a household that should never be charged. */
  planOverride: string | null;
  /** ISO instant. Null on a household that never had a trial. */
  trialEndsAt: string | null;
  subscription: {
    status: SubscriptionStatus;
    /** ISO instant. */
    currentPeriodEnd: string | null;
  } | null;
};

export type AccessSource = "comp" | "subscription" | "trial" | "none";

export type Access = {
  allowed: boolean;
  /** What is granting (or last granted) access. */
  source: AccessSource;
  /** ISO instant access runs out, or null when it never does. */
  until: string | null;
  /** Whole days left on the trial, floored, never negative. Null off-trial. */
  trialDaysLeft: number | null;
  /** True while a subscription exists but its payment is failing. The app stays
   *  usable — this is what a banner asking them to update the card keys on. */
  paymentFailing: boolean;
};

const DAY_MS = 86_400_000;

function addDaysISO(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

/**
 * How long a subscription in this state buys, measured from the end of the
 * period it last paid for.
 *
 * `canceled` gets no grace and that is deliberate: they asked to stop, and the
 * period they already paid for is exactly what they are owed. The grace periods
 * exist for people who did not choose to leave.
 */
function graceDays(status: SubscriptionStatus): number | null {
  switch (status) {
    case "active":
    case "trialing":
      return WEBHOOK_GRACE_DAYS;
    case "past_due":
      return DUNNING_GRACE_DAYS;
    case "canceled":
      return 0;
    // `unpaid` is where Polar lands after the retries run out, and the
    // incomplete/paused states never bought anything.
    default:
      return null;
  }
}

export function resolveAccess(facts: BillingFacts, now: Date = new Date()): Access {
  const nowMs = now.getTime();

  if (facts.planOverride === "comp") {
    return {
      allowed: true,
      source: "comp",
      until: null,
      trialDaysLeft: null,
      paymentFailing: false,
    };
  }

  const paymentFailing = facts.subscription?.status === "past_due";

  // Each source offers a deadline; the latest one wins. Written as a list
  // rather than a chain of `if`s so that adding a source (a lifetime deal, a
  // team plan) cannot silently reorder the existing ones.
  const offers: { source: AccessSource; until: string }[] = [];

  const sub = facts.subscription;
  if (sub?.currentPeriodEnd) {
    const grace = graceDays(sub.status);
    if (grace !== null) {
      offers.push({ source: "subscription", until: addDaysISO(sub.currentPeriodEnd, grace) });
    }
  }

  if (facts.trialEndsAt) {
    offers.push({ source: "trial", until: facts.trialEndsAt });
  }

  // Compared as instants, not as strings. These arrive from two places —
  // Postgres, which hands back "2026-12-01 06:00:00+00", and `addDaysISO`,
  // which produces "2026-12-01T00:00:00.000Z" — and comparing those two
  // lexicographically says the first is *earlier*, because a space sorts before
  // a "T". That is a paying customer locked out, so the comparison never sees a
  // string.
  const ms = (iso: string) => new Date(iso).getTime();
  const best = offers.reduce<{ source: AccessSource; until: string } | null>(
    (winner, o) => (!winner || ms(o.until) > ms(winner.until) ? o : winner),
    null,
  );

  const trialDaysLeft = facts.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(facts.trialEndsAt).getTime() - nowMs) / DAY_MS))
    : null;

  if (!best) {
    return { allowed: false, source: "none", until: null, trialDaysLeft, paymentFailing };
  }

  return {
    allowed: ms(best.until) > nowMs,
    source: best.source,
    until: best.until,
    trialDaysLeft,
    paymentFailing,
  };
}

/** When a trial started now would end. Used at sign-up and nowhere else. */
export function trialEndFrom(start: Date = new Date()): string {
  return new Date(start.getTime() + TRIAL_DAYS * DAY_MS).toISOString();
}

/**
 * Whether the trial deserves a nudge on screen.
 *
 * Three days is where the reminder stops being noise: far enough out to do
 * something about it, close enough that it is actually news.
 */
export const TRIAL_WARNING_DAYS = 3;

export function shouldWarnAboutTrial(access: Access): boolean {
  return (
    access.allowed &&
    access.source === "trial" &&
    access.trialDaysLeft !== null &&
    access.trialDaysLeft <= TRIAL_WARNING_DAYS
  );
}
