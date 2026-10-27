import "server-only";
import { auth } from "@/lib/auth";
import { isBillingEnabled } from "@/lib/billing-config";

/**
 * The two gates every server action starts with.
 *
 * They were the same four lines copied into a dozen files, which was fine while
 * there was one question to ask. Billing adds a second one, and a rule that has
 * to be added to twelve copies is a rule that will end up in eleven.
 */

/** Signed in, and belonging to a household. */
export async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

/**
 * Signed in, and entitled to change things.
 *
 * `proxy.ts` already turns a locked-out request into a redirect, so this is the
 * second lock rather than the first — it exists because the proxy protects
 * *paths*, and one forgotten entry in its matcher would open every write at
 * once. Reads deliberately do not go through here: someone whose trial ran out
 * must still be able to see and export their own data.
 */
export async function requireWriteAccess() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  // Nothing is gated until there is somewhere to pay — same rule as the session
  // callback, repeated here so this is safe to call from anywhere.
  if (isBillingEnabled() && !session.access?.allowed) {
    throw new Error("subscription required");
  }
  return { householdId: session.householdId, userId: session.user.id };
}
