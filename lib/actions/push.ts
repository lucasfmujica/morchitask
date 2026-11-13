"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/push-subscriptions";
import { getProfile, mergeNotificationPrefs } from "@/lib/db/queries/profiles";
import { pickNotificationPrefs } from "@/lib/notification-prefs";
import type { NotificationPrefs } from "@/lib/queries/types";

export async function getMyNotificationPrefs(): Promise<NotificationPrefs> {
  const session = await auth();
  if (!session?.user.id) return {};
  const profile = await getProfile(session.user.id);
  return (profile?.notification_prefs as NotificationPrefs) ?? {};
}

export async function saveMyNotificationPrefs(patch: NotificationPrefs) {
  const session = await auth();
  if (!session?.user.id) throw new Error("unauthorized");
  // The same jsonb column also holds server-owned markers (ai_usage,
  // onboarded_at, checkout_started_at, trial_reminder_sent_at). Taking the
  // patch as sent would let the browser reset its own AI quota or erase a
  // marker, and a read-modify-write here could undo a counter bumped in
  // between. So: only the user-editable keys, merged atomically in SQL.
  const next = await mergeNotificationPrefs(session.user.id, pickNotificationPrefs(patch));
  return pickNotificationPrefs(next ?? {});
}

export async function subscribeToPush(sub: { endpoint: string; p256dh: string; authKey: string }) {
  const session = await auth();
  if (!session?.user.id) throw new Error("unauthorized");
  await data.upsertSubscription(session.user.id, sub);
}

export async function unsubscribeFromPush(endpoint: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("unauthorized");
  await data.deleteSubscription(session.user.id, endpoint);
}
