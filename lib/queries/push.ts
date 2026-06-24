"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Notification preferences stored on `profiles.notification_prefs` (jsonb). */
export type NotificationPrefs = {
  dailyPlan?: boolean;
  dailyPlanTime?: string;
  taskReminders?: boolean;
};

/** VAPID public key (base64url) → Uint8Array for pushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Manage Web Push: the subscription (shared transport) plus the per-feature
 * preferences (daily plan reminder + per-task reminders). Web Push needs a
 * service worker (production build) + an installed PWA on iOS, so `supported`
 * is false in the dev preview and on platforms without push.
 *
 * Preferences are MERGED into `notification_prefs` so toggling one never
 * clobbers the other.
 */
export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>({});

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      VAPID_PUBLIC.length > 0;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub))
      .catch(() => {});

    // Load current prefs so toggles merge instead of overwrite.
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("notification_prefs")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.notification_prefs) setPrefs(data.notification_prefs as NotificationPrefs);
        });
    });
  }, []);

  /** Merge a prefs patch into the DB row and local state. */
  const savePrefs = useCallback(
    async (patch: NotificationPrefs) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const next = { ...prefs, ...patch };
      await supabase.from("profiles").update({ notification_prefs: next }).eq("id", user.id);
      setPrefs(next);
    },
    [prefs],
  );

  /** Subscribe this device to push (needed before any reminder can arrive). */
  async function subscribe(): Promise<boolean> {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });
    const json = sub.toJSON();
    const supabase = createClient();
    await supabase
      .from("push_subscriptions")
      .upsert(
        { endpoint: json.endpoint!, p256dh: json.keys!.p256dh, auth_key: json.keys!.auth },
        { onConflict: "endpoint" },
      );
    setEnabled(true);
    return true;
  }

  async function enable(): Promise<boolean> {
    setBusy(true);
    try {
      const ok = await subscribe();
      if (!ok) return false;
      await savePrefs({ dailyPlan: true, dailyPlanTime: "08:00" });
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function disable(): Promise<void> {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const supabase = createClient();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      // Turning off the device subscription turns off every push it carries.
      await savePrefs({ dailyPlan: false, taskReminders: false });
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  /** Toggle per-task reminders (rides on the existing subscription). */
  async function setTaskReminders(on: boolean): Promise<boolean> {
    setBusy(true);
    try {
      // First time on without a subscription yet → create one.
      if (on && !enabled) {
        const ok = await subscribe();
        if (!ok) return false;
      }
      await savePrefs({ taskReminders: on });
      return true;
    } finally {
      setBusy(false);
    }
  }

  return { supported, enabled, busy, prefs, enable, disable, setTaskReminders };
}
