// Writes a single time-BLOCK to the caller's PRIMARY Google Calendar (2-way sync).
// A task can have several blocks, each its own event.
// upsert: create/update the event for a block and store its id back on the block.
// delete: remove an event by id. Shared tasks invite the household partner.
// Security: the refresh token is read with the service role (client never sees it).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TZ = "America/Argentina/Buenos_Aires";
const APP_URL = "https://productivity-app-three-pink.vercel.app/today";

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
// sendUpdates=all so invited guests get the invite / cancellation notification.
const NOTIFY = "sendUpdates=all";

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
    if (!tokenJson.access_token) {
      console.error("[gcal-write] token_refresh_failed", JSON.stringify(tokenJson));
      return json({ error: "token_refresh_failed", detail: tokenJson }, 502);
    }
    const accessToken = tokenJson.access_token;
    const auth = { Authorization: `Bearer ${accessToken}` };

    const body = await req.json().catch(() => ({}));
    const action = body.action as "upsert" | "delete" | undefined;

    if (action === "delete") {
      const eventId = body.eventId as string | undefined;
      if (eventId) {
        await fetch(`${EVENTS}/${encodeURIComponent(eventId)}?${NOTIFY}`, {
          method: "DELETE",
          headers: auth,
        });
      }
      return json({ ok: true });
    }

    if (action !== "upsert") return json({ error: "bad_action" }, 400);

    const blockId = body.blockId as string;
    const { data: block } = await userClient
      .from("task_blocks")
      .select("id, start_at, end_at, gcal_event_id, tasks!inner(title, shared, household_id)")
      .eq("id", blockId)
      .maybeSingle();
    if (!block) return json({ error: "block_not_found" }, 404);
    const task = block.tasks as unknown as {
      title: string;
      shared: boolean;
      household_id: string | null;
    };

    // Shared task → invite the other household member (read email via service role).
    let attendees: { email: string }[] = [];
    if (task.shared && task.household_id) {
      const { data: members } = await admin
        .from("profiles")
        .select("id")
        .eq("household_id", task.household_id)
        .neq("id", user.id);
      const partnerId = members?.[0]?.id as string | undefined;
      if (partnerId) {
        const { data: partner } = await admin.auth.admin.getUserById(partnerId);
        const email = partner?.user?.email;
        if (email) attendees = [{ email }];
      }
    }

    const eventBody = {
      summary: task.title,
      start: { dateTime: block.start_at, timeZone: TZ },
      end: { dateTime: block.end_at, timeZone: TZ },
      // Always set attendees explicitly so un-sharing later clears the guest.
      attendees,
      source: { title: "Morchitask", url: APP_URL },
    };

    let eventId: string | null = block.gcal_event_id;
    let res: Response;
    if (eventId) {
      res = await fetch(`${EVENTS}/${encodeURIComponent(eventId)}?${NOTIFY}`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      });
      if (res.status === 404) eventId = null; // event was deleted in Google — recreate
    }
    if (!eventId) {
      res = await fetch(`${EVENTS}?${NOTIFY}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      });
    }
    const evJson = await res!.json();
    if (!evJson.id) {
      console.error("[gcal-write] gcal_write_failed", res!.status, JSON.stringify(evJson));
      return json({ error: "gcal_write_failed", detail: evJson }, 502);
    }

    await admin
      .from("task_blocks")
      .update({ gcal_event_id: evJson.id, gcal_synced_at: new Date().toISOString() })
      .eq("id", block.id);
    return json({ ok: true, eventId: evJson.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
