"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isLiveSubscription } from "@/lib/billing";
import { isBillingEnabled } from "@/lib/billing-config";
import { createCheckoutUrl, createPortalUrl, type BillingInterval } from "@/lib/polar";
import {
  billingManager,
  getSubscription,
  recordCheckoutStarted,
} from "@/lib/db/queries/subscriptions";
import { getHousehold } from "@/lib/db/queries/households";
import { getHouseholdProfiles } from "@/lib/db/queries/profiles";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { session, householdId: session.householdId };
}

/** What the billing screen shows: the resolved access, the subscription row
 *  when there is one, and the people it covers, with who of them pays.
 *
 *  Also what the page polls while a payment is being confirmed, which is why
 *  it re-reads the session every time: `auth()` resolves access afresh on
 *  each call, so the first poll after the webhook lands already says so. */
export async function getBillingState() {
  const { session, householdId } = await requireSession();
  const enabled = isBillingEnabled();
  const [subscription, manager, household, members] = await Promise.all([
    enabled ? getSubscription(householdId) : null,
    enabled ? billingManager(householdId) : null,
    getHousehold(householdId),
    getHouseholdProfiles(householdId),
  ]);
  return {
    enabled,
    access: session.access,
    // Only what the screen reads: the provider ids stay on the server.
    subscription: subscription
      ? {
          status: subscription.status,
          recurring_interval: subscription.recurring_interval,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: subscription.cancel_at_period_end,
        }
      : null,
    meId: session.user.id,
    spaceName: household?.name ?? null,
    members,
    manager: manager ? { id: manager.id, name: manager.display_name } : null,
  };
}

/** True when someone other than the caller is known to pay for this space.
 *  The plan is theirs to change: they hold the card and the invoices in Polar,
 *  and a second person changing it would act on someone else's payment. */
async function managedByOther(householdId: string, userId: string) {
  const manager = await billingManager(householdId);
  return !!manager && manager.id !== userId;
}

/** Where the person lands after paying. Built from the request rather than from
 *  an env var so previews send people back to the preview. */
async function origin() {
  const h = await headers();
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

/** Returned rather than thrown, for the same reason as the AI actions: Next
 *  hides a thrown message in production, and "this space already pays" is
 *  something the screen has to be able to say. */
export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: "already_subscribed" | "managed_by_other" };

export async function startCheckout(interval: BillingInterval): Promise<CheckoutResult> {
  const { session, householdId } = await requireSession();
  if (!isBillingEnabled()) throw new Error("billing is not configured");

  // A space that is already being charged gets no second checkout. The billing
  // screen hides the plans once access comes from a subscription, but that is
  // the client's idea of the state: a second tab left open, the other member
  // on their own phone, or a webhook that has not landed yet all show the
  // plans to someone who already pays, and Polar would happily take a second
  // subscription for the same household.
  const existing = await getSubscription(householdId);
  if (isLiveSubscription(existing?.status)) return { ok: false, error: "already_subscribed" };
  if (await managedByOther(householdId, session.user.id)) {
    return { ok: false, error: "managed_by_other" };
  }

  const url = await createCheckoutUrl({
    householdId,
    interval,
    userId: session.user.id,
    email: session.user.email,
    // The plan rides along so the confirming screen can say which one was
    // picked while the webhook is still on its way.
    successUrl: `${await origin()}/billing?checkout=done&plan=${interval}`,
  });

  // Recorded for the launch funnel's "Checkout" step, only once Polar has
  // actually opened a checkout. Never allowed to fail the sale: a metric that
  // costs a payment is a bad trade, so an error here is logged and dropped.
  try {
    await recordCheckoutStarted(householdId, session.user.id);
  } catch (err) {
    console.error("could not record checkout start", err);
  }

  return { ok: true, url };
}

/**
 * A link into Polar's portal: card, invoices, cancelling.
 *
 * Generated on demand and never stored — the session behind it is short-lived
 * by design, and a stale link in someone's history should open nothing.
 */
export async function openBillingPortal() {
  const { session, householdId } = await requireSession();
  if (!isBillingEnabled()) throw new Error("billing is not configured");
  if (await managedByOther(householdId, session.user.id)) throw new Error("forbidden");
  return createPortalUrl(householdId);
}
