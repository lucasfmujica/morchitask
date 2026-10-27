"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isBillingEnabled } from "@/lib/billing-config";
import { createCheckoutUrl, createPortalUrl, type BillingInterval } from "@/lib/polar";
import { getSubscription } from "@/lib/db/queries/subscriptions";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { session, householdId: session.householdId };
}

/**
 * The gate every mutation should sit behind once the trial is over.
 *
 * Separate from `requireSession()` rather than folded into it, because the two
 * answer different questions and have different failure modes: no session is a
 * redirect to sign in, no subscription is a redirect to pay. Reading the access
 * off the session means this costs nothing — it was resolved once, on the way in.
 */
export async function requireActiveSubscription() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  // With billing switched off nothing is gated — same rule as the session
  // callback, stated again here so this is safe to call from anywhere.
  if (!isBillingEnabled()) return { householdId: session.householdId, userId: session.user.id };
  if (!session.access?.allowed) throw new Error("subscription required");
  return { householdId: session.householdId, userId: session.user.id };
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

export async function startCheckout(interval: BillingInterval) {
  const { session, householdId } = await requireSession();
  if (!isBillingEnabled()) throw new Error("billing is not configured");

  return createCheckoutUrl({
    householdId,
    interval,
    email: session.user.email,
    successUrl: `${await origin()}/billing?checkout=done`,
  });
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
