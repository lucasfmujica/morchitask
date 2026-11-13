"use server";

import { del } from "@vercel/blob";
import { requireSession } from "@/lib/actions/session";
import { isLiveSubscription } from "@/lib/billing";
import * as data from "@/lib/db/queries/account";
import { getSubscription } from "@/lib/db/queries/subscriptions";
import { revokeSubscription } from "@/lib/polar";

/** Returned rather than thrown: Next hides a thrown message in production, and
 *  "your plan could not be cancelled, nothing was deleted" is the one thing the
 *  person needs to know. */
export type DeleteAccountResult = { ok: true } | { ok: false; error: "billing" };

/**
 * Your data, as one JSON file.
 *
 * Returned as a string rather than a `Response` so the button can be a plain
 * server action: the client turns it into a download. JSON and not CSV because
 * the shape is nested — a task has subtasks, blocks and comments — and
 * flattening it into a spreadsheet would lose exactly the parts that took work
 * to create.
 */
export async function exportMyData() {
  const { householdId, userId } = await requireSession();
  const payload = await data.exportAccount(householdId, userId);
  return {
    exported_at: new Date().toISOString(),
    format: 1,
    ...payload,
  };
}

/**
 * Deletes the account, for good.
 *
 * There is no soft delete and no grace period, because the privacy policy says
 * "definitivo e inmediato" and a hidden 30-day tombstone would make that false.
 * The client signs out afterwards; the session rows are gone by then, so the
 * cookie left in the browser no longer resolves to anything either way.
 */
export async function deleteMyAccount(): Promise<DeleteAccountResult> {
  const { householdId, userId } = await requireSession();

  // The subscription row cascades with the household, but the subscription
  // itself lives in Polar, which would have gone on charging the card every
  // month for a space that no longer exists. So it is cancelled first, and a
  // failure stops the delete: an account that is still here can be deleted
  // again, a charge with nothing behind it cannot be undone from here.
  //
  // Only the last person out cancels it. With someone else still in the
  // space, the plan is theirs too, and leaving must not take it from them.
  const subscription = await getSubscription(householdId);
  if (
    isLiveSubscription(subscription?.status) &&
    (await data.householdMemberCount(householdId)) <= 1
  ) {
    try {
      await revokeSubscription(subscription!.provider_subscription_id);
    } catch (err) {
      console.error("could not cancel the subscription before deleting the account", err);
      return { ok: false, error: "billing" };
    }
  }

  const { blobUrls } = await data.deleteAccount(householdId, userId);

  // Best effort, and after the rows: the database is the record of what exists,
  // so if Blob is unreachable the account is still gone and what is left behind
  // is an orphan file nothing can reach. Failing here would report a delete
  // that in fact succeeded.
  await Promise.allSettled(blobUrls.map((url) => del(url)));
  return { ok: true };
}
