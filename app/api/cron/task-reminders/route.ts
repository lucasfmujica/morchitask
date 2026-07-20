import { NextResponse } from "next/server";
import webpush from "web-push";
import {
  deleteSubscriptions,
  dueTaskReminders,
  markRemindersSent,
  profileNotificationPrefs,
  subscriptionsForProfiles,
} from "@/lib/db/queries/cron";

/** Fires per-task reminders. Scans tasks whose `remind_at` has passed and that
 * haven't been sent yet, and pushes the owner (if they enabled task reminders).
 * Triggered every ~5 minutes via Upstash QStash, configured to send
 * `x-cron-secret` as a custom header (see migration plan Fase 5). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized =
    !secret ||
    req.headers.get("x-cron-secret") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) return new Response("forbidden", { status: 401 });

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
  const subs = await subscriptionsForProfiles(owners);
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
        body: "Es hora de tu tarea ⏰",
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
