import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { households, profiles, subscriptions } from "@/lib/db/schema";
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

/**
 * Remembers that this person opened a checkout, the first time they do.
 *
 * The launch funnel needs a "Checkout" step between trying the app and paying,
 * and nothing recorded it: Polar knows, but asking Polar on every admin page
 * load would put a third-party API on the metrics' critical path.
 *
 * Stored as a key in `profiles.notification_prefs` because that is the one
 * jsonb column on a row we already write, and a dedicated column would have
 * needed a migration for a single timestamp. It is not a preference, and
 * nothing in the notification code reads it; the prefs writers merge rather
 * than replace (`saveMyNotificationPrefs`), so it survives a settings change.
 * If billing ever gets its own migration, move it to a real column then.
 *
 * Merged in SQL, not read-modify-written, so it cannot race a prefs save, and
 * only set when absent, so the first attempt is the one that counts. Scoped by
 * household as well as user, like every other write.
 */
export async function recordCheckoutStarted(householdId: string, userId: string) {
  await db
    .update(profiles)
    .set({
      notification_prefs: sql`${profiles.notification_prefs} || jsonb_build_object('checkout_started_at', now())`,
    })
    .where(
      and(
        eq(profiles.id, userId),
        eq(profiles.household_id, householdId),
        sql`${profiles.notification_prefs} ->> 'checkout_started_at' is null`,
      ),
    );
}
