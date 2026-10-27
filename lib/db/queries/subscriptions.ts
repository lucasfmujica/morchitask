import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { households, subscriptions } from "@/lib/db/schema";
import { isSubscriptionStatus, type BillingFacts } from "@/lib/billing";

/**
 * Postgres timestamps as ISO 8601.
 *
 * Drizzle's `mode: "string"` hands back Postgres's own rendering —
 * "2026-12-01 06:00:00+00" — which is a different format from the ISO strings
 * the rest of the billing code produces. Mixing the two is how a comparison
 * ends up wrong, so the data layer normalises on the way out and everything
 * above it can assume one format.
 */
function toISO(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Everything the access decision needs, in one read.
 *
 * One query rather than two because this runs on the way into every request:
 * the session callback calls it, and `resolveAccess` turns the result into a
 * yes or no. A left join keeps a household with no subscription — the normal
 * case during a trial — from disappearing.
 *
 * Keyed by household id, which comes from the session. There is no user-facing
 * way to ask about another household's billing.
 */
export async function billingFacts(householdId: string): Promise<BillingFacts | null> {
  const [row] = await db
    .select({
      trialEndsAt: households.trial_ends_at,
      planOverride: households.plan_override,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.current_period_end,
    })
    .from(households)
    .leftJoin(subscriptions, eq(subscriptions.household_id, households.id))
    .where(eq(households.id, householdId));

  if (!row) return null;

  return {
    planOverride: row.planOverride,
    trialEndsAt: toISO(row.trialEndsAt),
    // An unrecognised status is treated as no subscription rather than
    // crashing: a provider that invents a new one should cost a support
    // conversation, not a white screen for everybody.
    subscription: isSubscriptionStatus(row.status)
      ? { status: row.status, currentPeriodEnd: toISO(row.currentPeriodEnd) }
      : null,
  };
}

/** The full row, for the billing screen — period end, interval, whether it is
 *  set to stop. */
export async function getSubscription(householdId: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.household_id, householdId));
  return row ?? null;
}

export type SubscriptionUpsert = {
  householdId: string;
  providerSubscriptionId: string;
  providerCustomerId: string;
  status: string;
  recurringInterval: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * Writes what the provider just told us.
 *
 * Upsert on the household rather than insert-or-update by subscription id: a
 * household that cancels and later resubscribes gets a *new* subscription id
 * from Polar, and a plain insert would collide on the primary key while an
 * update keyed on the old id would silently write nothing.
 */
export async function upsertSubscription(input: SubscriptionUpsert) {
  const values = {
    household_id: input.householdId,
    provider_subscription_id: input.providerSubscriptionId,
    provider_customer_id: input.providerCustomerId,
    status: input.status,
    recurring_interval: input.recurringInterval,
    current_period_end: input.currentPeriodEnd,
    cancel_at_period_end: input.cancelAtPeriodEnd,
  };

  const [row] = await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.household_id, set: values })
    .returning();

  return row;
}

/** Which household a Polar customer belongs to — the fallback path when a
 *  webhook arrives without the household id we set at checkout. */
export async function householdByCustomerId(customerId: string) {
  const [row] = await db
    .select({ householdId: subscriptions.household_id })
    .from(subscriptions)
    .where(eq(subscriptions.provider_customer_id, customerId));
  return row?.householdId ?? null;
}

/** True when this household exists. Checked before a webhook writes a
 *  subscription row for an id that arrived from outside. */
export async function householdExists(householdId: string) {
  const [row] = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.id, householdId));
  return !!row;
}
