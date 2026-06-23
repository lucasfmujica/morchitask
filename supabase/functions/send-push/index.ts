// Sends the daily "plan your day" push to every subscribed user. Triggered by
// pg_cron at 11:00 UTC (08:00 America/Argentina/Buenos_Aires). Guarded by a
// shared x-cron-secret header. Needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
// VAPID_SUBJECT (and optionally CRON_SECRET) as edge-function secrets.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return new Response("forbidden", { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  // Who wants the daily reminder?
  const { data: profiles } = await admin.from("profiles").select("id, notification_prefs");
  const wanted = (profiles ?? [])
    .filter((p) => (p.notification_prefs as { dailyPlan?: boolean })?.dailyPlan === true)
    .map((p) => p.id);
  if (wanted.length === 0) {
    return Response.json({ sent: 0 });
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .in("profile_id", wanted);

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
    (subs ?? []).map(async (s) => {
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
  if (dead.length > 0) await admin.from("push_subscriptions").delete().in("id", dead);

  return Response.json({ sent, removed: dead.length });
});
