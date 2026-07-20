import { NextResponse } from "next/server";
import webpush from "web-push";
import {
  deleteSubscriptions,
  profileNotificationPrefs,
  subscriptionsForProfiles,
} from "@/lib/db/queries/cron";

/** Sends the daily "plan your day" push to every subscribed user. Triggered by
 * Vercel Cron at 11:00 UTC (08:00 America/Argentina/Buenos_Aires). Vercel Cron
 * sends `Authorization: Bearer <CRON_SECRET>` automatically when that env var
 * is set; `x-cron-secret` is accepted too for manual/QStash calls. */
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

  const prefs = await profileNotificationPrefs();
  const wanted = [...prefs.entries()].filter(([, p]) => p?.dailyPlan === true).map(([id]) => id);
  if (wanted.length === 0) return NextResponse.json({ sent: 0 });

  const subs = await subscriptionsForProfiles(wanted);

  // 08:00 ART runs at 11:00 UTC — same calendar day, so the UTC date is correct.
  const today = new Date().toISOString().slice(0, 10);
  const payload = JSON.stringify({
    title: "Planificá tu día ☀️",
    body: "Elegí tus tareas y ponéles una intención.",
    url: `/plan/${today}`,
  });

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
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
    }),
  );
  if (dead.length > 0) await deleteSubscriptions(dead);

  return NextResponse.json({ sent, removed: dead.length });
}
