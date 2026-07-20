import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGoogleRefreshToken } from "@/lib/db/queries/google";
import { refreshGoogleAccessToken } from "@/lib/google";

type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  backgroundColor?: string;
  selected?: boolean;
};

type GoogleEvent = {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
};

/** Reads the caller's Google Calendar events (across ALL their calendars) for a time range. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const refreshToken = await getGoogleRefreshToken(session.user.id);
  if (!refreshToken) return NextResponse.json({ events: [], connected: false });

  const accessToken = await refreshGoogleAccessToken(refreshToken);
  if (!accessToken) {
    return NextResponse.json({ error: "token_refresh_failed" }, { status: 502 });
  }

  const { timeMin, timeMax } = await req.json().catch(() => ({}));
  const min = timeMin ?? new Date().toISOString();
  const max = timeMax ?? new Date(Date.now() + 86_400_000).toISOString();

  // List the user's calendars (the ones they have shown).
  const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listJson = await listRes.json();
  const calendars: GoogleCalendarListEntry[] = (listJson.items ?? []).filter(
    (c: GoogleCalendarListEntry) => c.selected !== false,
  );

  // Fetch events from every calendar in parallel and merge.
  const perCalendar = await Promise.all(
    calendars.map(async (cal) => {
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
      return ((j.items ?? []) as GoogleEvent[]).map((e) => ({
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
  return NextResponse.json({ events, connected: true, calendars: calendars.length });
}
