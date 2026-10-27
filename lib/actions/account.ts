"use server";

import { del } from "@vercel/blob";
import { requireSession } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/account";

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
export async function deleteMyAccount() {
  const { householdId, userId } = await requireSession();

  const { blobUrls } = await data.deleteAccount(householdId, userId);

  // Best effort, and after the rows: the database is the record of what exists,
  // so if Blob is unreachable the account is still gone and what is left behind
  // is an orphan file nothing can reach. Failing here would report a delete
  // that in fact succeeded.
  await Promise.allSettled(blobUrls.map((url) => del(url)));
}
