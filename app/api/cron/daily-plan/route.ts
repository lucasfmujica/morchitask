import { NextResponse } from "next/server";
import webpush from "web-push";
import { getTranslations } from "next-intl/server";
import {
  claimTrialReminders,
  deleteSubscriptions,
  profileBillingFacts,
  profileLocales,
  subscriptionsForProfiles,
} from "@/lib/db/queries/cron";
import { isBillingEnabled } from "@/lib/billing-config";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendDailyPlanPushes } from "@/lib/daily-plan-push";
import { DEFAULT_LOCALE } from "@/lib/locale";
import { trialReminderDays } from "@/lib/push-audience";

/** The once-a-day cron (Vercel Cron, 11:00 UTC). Sends the one-off "your trial
 * ends soon" push to whoever is in its window, and the "plan your day" push to
 * anyone whose morning it is and who has not had it yet: at this hour that is
 * UTC-3. Everyone else gets theirs from the reminders cron, which runs every
 * few minutes; see `sendDailyPlanPushes`.
 * Authorization is handled by `isAuthorizedCron`. */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("forbidden", { status: 401 });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const now = new Date();
  const plan = await sendDailyPlanPushes(now);

  const billingEnabled = isBillingEnabled();
  const facts = await profileBillingFacts();
  const trialDays = new Map<string, number>();
  for (const [id, f] of facts) {
    const days = trialReminderDays(f, billingEnabled, now);
    if (days !== null) trialDays.set(id, days);
  }
  if (trialDays.size === 0) {
    return NextResponse.json({ sent: plan.sent, trialReminders: 0, removed: plan.removed });
  }

  const [subs, locales] = await Promise.all([
    subscriptionsForProfiles([...trialDays.keys()]),
    profileLocales(),
  ]);
  // Only people with a device to send to are claimed: someone without push
  // stays unclaimed, and the in-app chip is what tells them.
  const withDevice = new Set(subs.map((s) => s.profile_id));
  const trialRecipients = new Set(
    await claimTrialReminders([...trialDays.keys()].filter((id) => withDevice.has(id))),
  );

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      if (!trialRecipients.has(s.profile_id)) return;
      // There is no request to read a cookie from here, so the language comes
      // from the recipient's column.
      const t = await getTranslations({
        locale: locales.get(s.profile_id) ?? DEFAULT_LOCALE,
        namespace: "push",
      });
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
          JSON.stringify({
            title: t("trialTitle"),
            body: t("trialBody", { days: trialDays.get(s.profile_id)! }),
            url: "/billing",
          }),
        );
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(s.id); // gone, prune it
      }
    }),
  );
  if (dead.length > 0) await deleteSubscriptions([...new Set(dead)]);

  return NextResponse.json({
    sent: plan.sent + sent,
    trialReminders: trialRecipients.size,
    removed: plan.removed + dead.length,
  });
}
