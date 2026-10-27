import { NextResponse } from "next/server";
import webpush from "web-push";
import { getTranslations } from "next-intl/server";
import {
  deleteSubscriptions,
  profileLocales,
  profileNotificationPrefs,
  subscriptionsForProfiles,
} from "@/lib/db/queries/cron";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/locale";

/** Sends the daily "plan your day" push to every subscribed user. Triggered by
 * Vercel Cron at 11:00 UTC (08:00 America/Argentina/Buenos_Aires).
 * Authorization is handled by `isAuthorizedCron`. */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("forbidden", { status: 401 });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const prefs = await profileNotificationPrefs();
  const wanted = [...prefs.entries()].filter(([, p]) => p?.dailyPlan === true).map(([id]) => id);
  if (wanted.length === 0) return NextResponse.json({ sent: 0 });

  const [subs, locales] = await Promise.all([subscriptionsForProfiles(wanted), profileLocales()]);

  // 08:00 ART runs at 11:00 UTC — same calendar day, so the UTC date is correct.
  const today = new Date().toISOString().slice(0, 10);

  // There is no request to read a cookie from here, so the language comes from
  // each recipient's column. Built once per language rather than once per
  // subscription: this sweeps every household, and the two of them share a
  // notification most nights.
  const payloads = new Map<Locale, string>();
  for (const locale of LOCALES) {
    const t = await getTranslations({ locale, namespace: "push" });
    payloads.set(
      locale,
      JSON.stringify({ title: t("planTitle"), body: t("planBody"), url: `/plan/${today}` }),
    );
  }

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          payloads.get(locales.get(s.profile_id) ?? DEFAULT_LOCALE)!,
        );
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(s.id); // gone — prune it
      }
    }),
  );
  if (dead.length > 0) await deleteSubscriptions(dead);

  return NextResponse.json({ sent, removed: dead.length });
}
