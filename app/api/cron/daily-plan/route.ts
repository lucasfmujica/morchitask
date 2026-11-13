import { NextResponse } from "next/server";
import webpush from "web-push";
import { getTranslations } from "next-intl/server";
import {
  claimTrialReminders,
  deleteSubscriptions,
  profileBillingFacts,
  profileLocales,
  profileNotificationPrefs,
  subscriptionsForProfiles,
} from "@/lib/db/queries/cron";
import { isBillingEnabled } from "@/lib/billing-config";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/locale";
import { mayNotify, trialReminderDays } from "@/lib/push-audience";

/** Sends the daily "plan your day" push to every subscribed user, and the
 * one-off "your trial ends soon" push to whoever is in its window. Triggered
 * by Vercel Cron at 11:00 UTC (08:00 America/Argentina/Buenos_Aires).
 * Authorization is handled by `isAuthorizedCron`. */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("forbidden", { status: 401 });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const billingEnabled = isBillingEnabled();
  const now = new Date();
  const [prefs, facts] = await Promise.all([profileNotificationPrefs(), profileBillingFacts()]);

  // A locked-out household is not reminded to plan a day the app will not let
  // it open. Comped households always pass (`mayNotify`).
  const wanted = [...prefs.entries()]
    .filter(([id, p]) => p?.dailyPlan === true && mayNotify(facts.get(id), billingEnabled, now))
    .map(([id]) => id);

  const trialDays = new Map<string, number>();
  for (const [id, f] of facts) {
    const days = trialReminderDays(f, billingEnabled, now);
    if (days !== null) trialDays.set(id, days);
  }

  if (wanted.length === 0 && trialDays.size === 0) return NextResponse.json({ sent: 0 });

  const [subs, locales] = await Promise.all([
    subscriptionsForProfiles([...new Set([...wanted, ...trialDays.keys()])]),
    profileLocales(),
  ]);

  // 08:00 ART runs at 11:00 UTC — same calendar day, so the UTC date is correct.
  const today = now.toISOString().slice(0, 10);

  // There is no request to read a cookie from here, so the language comes from
  // each recipient's column. Built once per language rather than once per
  // subscription: this sweeps every household, and the two of them share a
  // notification most nights.
  const translators = new Map<Locale, Awaited<ReturnType<typeof getTranslations<"push">>>>();
  const payloads = new Map<Locale, string>();
  for (const locale of LOCALES) {
    const t = await getTranslations({ locale, namespace: "push" });
    translators.set(locale, t);
    payloads.set(
      locale,
      JSON.stringify({ title: t("planTitle"), body: t("planBody"), url: `/plan/${today}` }),
    );
  }
  const localeOf = (profileId: string) => locales.get(profileId) ?? DEFAULT_LOCALE;

  // Only people with a device to send to are claimed: someone without push
  // stays unclaimed, and the in-app chip is what tells them.
  const withDevice = new Set(subs.map((s) => s.profile_id));
  const trialRecipients = new Set(
    await claimTrialReminders([...trialDays.keys()].filter((id) => withDevice.has(id))),
  );
  const wantedSet = new Set(wanted);

  let sent = 0;
  const dead: string[] = [];
  const send = async (s: (typeof subs)[number], payload: string) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        payload,
      );
      sent += 1;
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) dead.push(s.id); // gone — prune it
    }
  };

  await Promise.all(
    subs.map(async (s) => {
      if (wantedSet.has(s.profile_id)) await send(s, payloads.get(localeOf(s.profile_id))!);
      if (trialRecipients.has(s.profile_id)) {
        const t = translators.get(localeOf(s.profile_id))!;
        const days = trialDays.get(s.profile_id)!;
        await send(
          s,
          JSON.stringify({
            title: t("trialTitle"),
            body: t("trialBody", { days }),
            url: "/billing",
          }),
        );
      }
    }),
  );
  if (dead.length > 0) await deleteSubscriptions([...new Set(dead)]);

  return NextResponse.json({ sent, trialReminders: trialRecipients.size, removed: dead.length });
}
