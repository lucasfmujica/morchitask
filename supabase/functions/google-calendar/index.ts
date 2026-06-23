// Reads the caller's Google Calendar events (across ALL their calendars) for a
// time range. Security: the user's refresh token is read with the service role
// (the client can never read it). Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    if (!cred?.refresh_token) return json({ events: [], connected: false });

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
      return json({ error: "token_refresh_failed", detail: tokenJson }, 502);
    }
    const accessToken = tokenJson.access_token;

    const { timeMin, timeMax } = await req.json().catch(() => ({}));
    const min = timeMin ?? new Date().toISOString();
    const max = timeMax ?? new Date(Date.now() + 86_400_000).toISOString();

    // List the user's calendars (the ones they have shown).
    const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listJson = await listRes.json();
    const calendars = (listJson.items ?? []).filter(
      (c: Record<string, any>) => c.selected !== false,
    );

    // Fetch events from every calendar in parallel and merge.
    const perCalendar = await Promise.all(
      calendars.map(async (cal: Record<string, any>) => {
        const params = new URLSearchParams({
          timeMin: min,
          timeMax: max,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "50",
        });
        const r = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const j = await r.json();
        return (j.items ?? []).map((e: Record<string, any>) => ({
          id: e.id,
          title: e.summary ?? "(sin título)",
          start: e.start?.dateTime ?? e.start?.date ?? null,
          end: e.end?.dateTime ?? e.end?.date ?? null,
          allDay: !e.start?.dateTime,
          htmlLink: e.htmlLink ?? null,
          calendar: cal.summary ?? null,
          color: cal.backgroundColor ?? null,
        }));
      }),
    );

    const events = perCalendar.flat();
    return json({ events, connected: true, calendars: calendars.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
