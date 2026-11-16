import webpush from "web-push";
import { getTranslations } from "next-intl/server";
import {
  claimDailyPlan,
  deleteSubscriptions,
  profileBillingFacts,
  profileLocales,
  profileNotificationPrefs,
  subscriptionsForProfiles,
} from "@/lib/db/queries/cron";
import { isBillingEnabled } from "@/lib/billing-config";
import { DEFAULT_LOCALE } from "@/lib/locale";
import { mayNotify } from "@/lib/push-audience";

/**
 * Sends the "plan your day" push to everyone whose morning it is.
 *
 * It used to go out once, at 11:00 UTC, which is 08:00 in Buenos Aires and
 * lunchtime in Madrid. Now each person gets it at 08:00 on their own clock:
 * this is called from the reminders cron (every few minutes) and from the
 * daily Vercel cron, and `claimDailyPlan` decides who is due and makes sure
 * nobody is sent it twice. The daily cron alone still covers UTC-3 if the
 * external schedule ever stops.
 *
 * The caller has already authorised the request and set the VAPID details.
 */
export async function sendDailyPlanPushes(now: Date): Promise<{ sent: number; removed: number }> {
  const billingEnabled = isBillingEnabled();
  const [prefs, facts] = await Promise.all([profileNotificationPrefs(), profileBillingFacts()]);

  // A locked-out household is not reminded to plan a day the app will not let
  // it open. Comped households always pass (`mayNotify`).
  const wanted = [...prefs.entries()]
    .filter(([id, p]) => p?.dailyPlan === true && mayNotify(facts.get(id), billingEnabled, now))
    .map(([id]) => id);
  if (wanted.length === 0) return { sent: 0, removed: 0 };

  // Only people with a device are claimed: someone who enables push at noon
  // should not find the morning already spent.
  const subs = await subscriptionsForProfiles(wanted);
  const claimed = await claimDailyPlan([...new Set(subs.map((s) => s.profile_id))], now);
  if (claimed.length === 0) return { sent: 0, removed: 0 };
  const dayOf = new Map(claimed.map((c) => [c.id, c.day]));

  const locales = await profileLocales();
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      const day = dayOf.get(s.profile_id);
      if (!day) return;
      // No request to read a cookie from, so the language is the recipient's column.
      const t = await getTranslations({
        locale: locales.get(s.profile_id) ?? DEFAULT_LOCALE,
        namespace: "push",
      });
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          JSON.stringify({ title: t("planTitle"), body: t("planBody"), url: `/plan/${day}` }),
        );
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(s.id); // gone, prune it
      }
    }),
  );
  if (dead.length > 0) await deleteSubscriptions([...new Set(dead)]);
  return { sent, removed: dead.length };
}
