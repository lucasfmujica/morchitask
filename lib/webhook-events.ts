import { isSubscriptionStatus, type SubscriptionStatus } from "@/lib/billing";

/**
 * Turning a provider's webhook into the four facts this app stores.
 *
 * Pure, and separate from the route, because the route's own job — verifying a
 * signature and answering with a status code — is untestable without a real
 * secret and a real request, while *this* is where getting it wrong charges
 * someone or locks them out. Splitting them means the interesting half has
 * tests.
 */

export type SubscriptionEvent = {
  householdId: string;
  providerSubscriptionId: string;
  providerCustomerId: string;
  status: SubscriptionStatus;
  recurringInterval: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

/** The subset of Polar's payload this reads. Declared structurally so a version
 *  bump that adds fields is a non-event. */
type PolarSubscriptionLike = {
  id?: unknown;
  status?: unknown;
  customerId?: unknown;
  currentPeriodEnd?: unknown;
  cancelAtPeriodEnd?: unknown;
  recurringInterval?: unknown;
  metadata?: Record<string, unknown> | null;
  customer?: { externalId?: unknown } | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

function iso(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * Which household this subscription belongs to.
 *
 * Checkout sets the household id in two places — as the customer's external id
 * and in the checkout metadata — so this reads both. Not belt and braces for
 * its own sake: Polar attaches them to different objects, and which one is
 * populated depends on whether the event is about the subscription or the
 * customer behind it.
 */
export function householdIdFrom(sub: PolarSubscriptionLike): string | null {
  return str(sub.customer?.externalId) ?? str(sub.metadata?.household_id);
}

/**
 * Reads a subscription payload, or returns null when it is not usable.
 *
 * Null rather than a throw: a webhook that cannot be placed is answered with
 * 200 and dropped, because the provider's retry would deliver the same
 * unplaceable payload forever and bury the events that do matter.
 */
export function parseSubscriptionEvent(sub: PolarSubscriptionLike): SubscriptionEvent | null {
  const householdId = householdIdFrom(sub);
  const providerSubscriptionId = str(sub.id);
  const providerCustomerId = str(sub.customerId);
  if (!householdId || !providerSubscriptionId || !providerCustomerId) return null;

  // An unrecognised status is the one thing worth refusing outright: storing it
  // would make `resolveAccess` fall through to "no subscription" and quietly
  // paywall someone who is paying.
  if (!isSubscriptionStatus(sub.status)) return null;

  return {
    householdId,
    providerSubscriptionId,
    providerCustomerId,
    status: sub.status,
    recurringInterval: str(sub.recurringInterval),
    currentPeriodEnd: iso(sub.currentPeriodEnd),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd === true,
  };
}

/** The event types worth acting on. Everything else Polar sends — orders,
 *  benefits, products — has no bearing on whether the app opens. */
export const HANDLED_EVENTS = [
  "subscription.created",
  "subscription.active",
  "subscription.updated",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.past_due",
  "subscription.revoked",
] as const;

export function isHandledEvent(type: unknown): boolean {
  return typeof type === "string" && (HANDLED_EVENTS as readonly string[]).includes(type);
}
