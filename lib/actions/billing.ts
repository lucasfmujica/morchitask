"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isLiveSubscription } from "@/lib/billing";
import { isBillingEnabled } from "@/lib/billing-config";
import { createCheckoutUrl, createPortalUrl, type BillingInterval } from "@/lib/polar";
import { getSubscription, recordCheckoutStarted } from "@/lib/db/queries/subscriptions";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { session, householdId: session.householdId };
}

/** What the billing screen shows: the resolved access, plus the subscription
 *  row when there is one. */
export async function getBillingState() {
  const { session, householdId } = await requireSession();
  const subscription = isBillingEnabled() ? await getSubscription(householdId) : null;
  return {
    enabled: isBillingEnabled(),
    access: session.access,
    subscription,
  };
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
export type CheckoutResult = { ok: true; url: string } | { ok: false; error: "already_subscribed" };

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

  const url = await createCheckoutUrl({
    householdId,
    interval,
    userId: session.user.id,
    email: session.user.email,
    successUrl: `${await origin()}/billing?checkout=done`,
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
  const { householdId } = await requireSession();
  if (!isBillingEnabled()) throw new Error("billing is not configured");
  return createPortalUrl(householdId);
}
