// Fires per-task reminders. Scans tasks whose `remind_at` has passed and that
// haven't been sent yet, and pushes the owner (if they enabled task reminders).
// Meant to run every ~5 minutes via pg_cron. Guarded by x-cron-secret. Reuses
// the same VAPID secrets as send-push.
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

  const nowISO = new Date().toISOString();

  // Past-due reminders not yet delivered, for tasks still open.
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, owner_id, title, planned_date")
    .lte("remind_at", nowISO)
    .is("reminder_sent_at", null)
    .eq("status", "todo");

  if (!tasks || tasks.length === 0) {
    return Response.json({ sent: 0 });
  }

  // Which owners opted into task reminders?
  const { data: profiles } = await admin.from("profiles").select("id, notification_prefs");
  const wantsReminders = new Set(
    (profiles ?? [])
      .filter((p) => (p.notification_prefs as { taskReminders?: boolean })?.taskReminders === true)
      .map((p) => p.id),
  );

  const owners = [...new Set(tasks.map((t) => t.owner_id))];
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, profile_id, endpoint, p256dh, auth_key")
    .in("profile_id", owners);

  const subsByOwner = new Map<string, typeof subs>();
  for (const s of subs ?? []) {
    const list = subsByOwner.get(s.profile_id) ?? [];
    list.push(s);
    subsByOwner.set(s.profile_id, list);
  }

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    tasks.map(async (t) => {
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
  await admin
    .from("tasks")
    .update({ reminder_sent_at: nowISO })
    .in(
      "id",
      tasks.map((t) => t.id),
    );

  if (dead.length > 0) await admin.from("push_subscriptions").delete().in("id", dead);

  return Response.json({ sent, processed: tasks.length, removed: dead.length });
});
