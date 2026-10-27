import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";

export async function upsertSubscription(
  profileId: string,
  sub: { endpoint: string; p256dh: string; authKey: string },
) {
  await db
    .insert(pushSubscriptions)
    .values({
      profile_id: profileId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth_key: sub.authKey,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      // `profile_id` has to move too. A browser reuses one push subscription
      // per origin, so on a shared device — which is what this app is for —
      // the second person to sign in lands on the first person's row. Without
      // this, their phone keeps buzzing with someone else's reminders.
      set: { profile_id: profileId, p256dh: sub.p256dh, auth_key: sub.authKey },
    });
}

/** Scoped to the owner: the session check in the action is meaningless unless
 *  the id it proves reaches the query. */
export async function deleteSubscription(profileId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.profile_id, profileId), eq(pushSubscriptions.endpoint, endpoint)),
    );
}
