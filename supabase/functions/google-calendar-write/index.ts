// Writes a task's time-block to the caller's PRIMARY Google Calendar (2-way sync).
// upsert: create/update the event for a task and store its id back on the task.
// delete: remove an event by id. Security: the refresh token is read with the
// service role (the client never sees it). Reuses GOOGLE_CLIENT_ID / _SECRET.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TZ = "America/Argentina/Buenos_Aires";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, service);
    const { data: cred } = await admin
      .from("google_credentials")
      .select("refresh_token")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!cred?.refresh_token) return json({ error: "not_connected" }, 400);

    // refresh token -> short-lived access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: cred.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token)
      return json({ error: "token_refresh_failed", detail: tokenJson }, 502);
    const accessToken = tokenJson.access_token;
    const auth = { Authorization: `Bearer ${accessToken}` };

    const body = await req.json().catch(() => ({}));
    const action = body.action as "upsert" | "delete" | undefined;

    if (action === "delete") {
      const eventId = body.eventId as string | undefined;
      if (eventId) {
        await fetch(`${EVENTS}/${encodeURIComponent(eventId)}`, {
          method: "DELETE",
          headers: auth,
        });
      }
      return json({ ok: true });
    }

    if (action !== "upsert") return json({ error: "bad_action" }, 400);

    const taskId = body.taskId as string;
    const { data: task } = await userClient
      .from("tasks")
      .select("id, title, block_start, block_end, gcal_event_id")
      .eq("id", taskId)
      .maybeSingle();
    if (!task) return json({ error: "task_not_found" }, 404);

    // No block anymore → make sure any existing event is removed.
    if (!task.block_start || !task.block_end) {
      if (task.gcal_event_id) {
        await fetch(`${EVENTS}/${encodeURIComponent(task.gcal_event_id)}`, {
          method: "DELETE",
          headers: auth,
        });
        await admin
          .from("tasks")
          .update({ gcal_event_id: null, gcal_synced_at: new Date().toISOString() })
          .eq("id", task.id);
      }
      return json({ ok: true });
    }

    const eventBody = {
      summary: task.title,
      start: { dateTime: task.block_start, timeZone: TZ },
      end: { dateTime: task.block_end, timeZone: TZ },
      source: { title: "Morchitask" },
    };

    let eventId: string | null = task.gcal_event_id;
    let res: Response;
    if (eventId) {
      res = await fetch(`${EVENTS}/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      });
      if (res.status === 404) eventId = null; // event was deleted in Google — recreate
    }
    if (!eventId) {
      res = await fetch(EVENTS, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      });
    }
    const evJson = await res!.json();
    if (!evJson.id) return json({ error: "gcal_write_failed", detail: evJson }, 502);

    await admin
      .from("tasks")
      .update({ gcal_event_id: evJson.id, gcal_synced_at: new Date().toISOString() })
      .eq("id", task.id);
    return json({ ok: true, eventId: evJson.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
