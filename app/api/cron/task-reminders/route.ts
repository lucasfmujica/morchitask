import { NextResponse } from "next/server";
import webpush from "web-push";
import { getTranslations } from "next-intl/server";
import {
  deleteSubscriptions,
  dueTaskReminders,
  markRemindersSent,
  profileLocales,
  profileNotificationPrefs,
  subscriptionsForProfiles,
} from "@/lib/db/queries/cron";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/locale";

/**
 * Fires per-task reminders. Scans tasks whose `remind_at` has passed and that
 * haven't been sent yet, and pushes the owner (if they enabled task reminders).
 *
 * **Scheduled outside this repo.** Unlike `daily-plan`, this one is NOT in
 * `vercel.json`: it needs to run every ~5 minutes and Vercel's Hobby plan caps
 * crons at daily, so it's driven by an external Upstash QStash schedule that
 * sends `x-cron-secret` as a custom header. Two consequences worth knowing:
 * nothing in the repo will tell you if that schedule stops, and adding it to
 * `vercel.json` on Pro without deleting the QStash one would fire every
 * reminder twice.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("forbidden", { status: 401 });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const nowISO = new Date().toISOString();
  const dueTasks = await dueTaskReminders(nowISO);
  if (dueTasks.length === 0) return NextResponse.json({ sent: 0 });

  const prefs = await profileNotificationPrefs();
  const wantsReminders = new Set(
    [...prefs.entries()].filter(([, p]) => p?.taskReminders === true).map(([id]) => id),
  );

  const owners = [...new Set(dueTasks.map((t) => t.owner_id))];
  const [subs, locales] = await Promise.all([subscriptionsForProfiles(owners), profileLocales()]);

  // Only the body is ours; the title is the task, which is whatever the person
  // typed. One lookup per language rather than per reminder.
  const bodies = new Map<Locale, string>();
  for (const locale of LOCALES) {
    const t = await getTranslations({ locale, namespace: "push" });
    bodies.set(locale, t("reminderBody"));
  }
  const subsByOwner = new Map<string, typeof subs>();
  for (const s of subs) {
    const list = subsByOwner.get(s.profile_id) ?? [];
    list.push(s);
    subsByOwner.set(s.profile_id, list);
  }

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    dueTasks.map(async (t) => {
      if (!wantsReminders.has(t.owner_id)) return; // opted out — still marked sent below
      const payload = JSON.stringify({
        title: t.title,
        body: bodies.get(locales.get(t.owner_id) ?? DEFAULT_LOCALE)!,
        url: t.planned_date ? `/day/${t.planned_date}` : "/today",
      });
      for (const s of subsByOwner.get(t.owner_id) ?? []) {
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
      }
    }),
  );

  // Mark every scanned task as sent so it isn't rescanned (even opted-out ones).
  await markRemindersSent(
    dueTasks.map((t) => t.id),
    nowISO,
  );
  if (dead.length > 0) await deleteSubscriptions(dead);

  return NextResponse.json({ sent, processed: dueTasks.length, removed: dead.length });
}
