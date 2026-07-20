"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/push-subscriptions";
import { getProfile, updateProfile } from "@/lib/db/queries/profiles";
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
  const profile = await getProfile(session.user.id);
  const next = { ...(profile?.notification_prefs as NotificationPrefs), ...patch };
  await updateProfile(session.user.id, { notification_prefs: next });
  return next;
}

export async function subscribeToPush(sub: { endpoint: string; p256dh: string; authKey: string }) {
  const session = await auth();
  if (!session?.user.id) throw new Error("unauthorized");
  await data.upsertSubscription(session.user.id, sub);
}

export async function unsubscribeFromPush(endpoint: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("unauthorized");
  await data.deleteSubscription(endpoint);
}
