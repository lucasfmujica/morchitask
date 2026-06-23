"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

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
 * Manage the daily "plan your day" push subscription. Web Push needs a service
 * worker (production build) + an installed PWA on iOS, so `supported` is false
 * in the dev preview and on platforms without push.
 */
export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

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
  }, []);

  async function enable(): Promise<boolean> {
    setBusy(true);
    try {
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ notification_prefs: { dailyPlan: true, dailyPlanTime: "08:00" } })
          .eq("id", user.id);
      }
      setEnabled(true);
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ notification_prefs: { dailyPlan: false } })
          .eq("id", user.id);
      }
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  return { supported, enabled, busy, enable, disable };
}
