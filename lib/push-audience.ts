import {
  hasWriteAccess,
  resolveAccess,
  shouldWarnAboutTrial,
  type BillingFacts,
} from "@/lib/billing";

/**
 * Who the crons may still send a push to, decided the same way the app decides
 * who may come in.
 *
 * The crons ran with no session and so with no access check at all: a
 * household whose trial had ended went on getting "plan your day" every
 * morning, for an app that then opened on the paywall. Comped households
 * resolve to allowed, so the two people who use this daily are never skipped.
 * With billing off, nobody is gated, here or anywhere.
 *
 * A profile with no facts (no household row behind it, which the schema does
 * not allow) is skipped while billing is on rather than assumed paying.
 */
export function mayNotify(
  facts: BillingFacts | undefined,
  billingEnabled: boolean,
  now: Date = new Date(),
): boolean {
  if (!billingEnabled) return true;
  if (!facts) return false;
  return hasWriteAccess(resolveAccess(facts, now), true);
}

/**
 * How many trial days are left, when this person should get the "your trial
 * ends soon" push; null when they should not.
 *
 * The same window as the in-app chip's "late" state (`shouldWarnAboutTrial`),
 * so the push never says something the app does not. Only with billing on: a
 * trial that ends into nothing (no paywall yet) is not news. Sending it once
 * is the caller's job (`claimTrialReminders`).
 */
export function trialReminderDays(
  facts: BillingFacts | undefined,
  billingEnabled: boolean,
  now: Date = new Date(),
): number | null {
  if (!billingEnabled || !facts) return null;
  const access = resolveAccess(facts, now);
  return shouldWarnAboutTrial(access) ? access.trialDaysLeft : null;
}
