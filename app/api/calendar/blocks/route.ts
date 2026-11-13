import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { partnerEmail } from "@/lib/db/queries/profiles";
import { blockForCalendarSync, setBlockCalendarEvent } from "@/lib/db/queries/task-blocks";
import { calendarAccessFailure, calendarAccessToken } from "@/lib/google-calendar";

const TZ = "America/Argentina/Buenos_Aires";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://productivity-app-three-pink.vercel.app";
const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
// sendUpdates=all so invited guests get the invite / cancellation notification.
const NOTIFY = "sendUpdates=all";

/**
 * Writes a single time-block to the caller's PRIMARY Google Calendar (2-way sync):
 * creates or updates the event for a block and stores its id back on the block.
 * Shared tasks invite the household partner.
 *
 * There is no "delete" action any more. It took an event id from the browser
 * and deleted it, whatever event it was. Deleting now happens on the server,
 * from the ids on our own block rows (`deleteCalendarEvents`).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.householdId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.action !== "upsert") return NextResponse.json({ error: "bad_action" }, { status: 400 });

  const access = await calendarAccessToken(session.user.id);
  if (!access.ok) return calendarAccessFailure(access.reason);
  const authHeader = { Authorization: `Bearer ${access.accessToken}` };

  const blockId = body.blockId as string;
  const block = await blockForCalendarSync(session.householdId, blockId);
  if (!block) return NextResponse.json({ error: "block_not_found" }, { status: 404 });

  // Shared task → invite the other household member.
  let attendees: { email: string }[] = [];
  if (block.shared) {
    const email = await partnerEmail(session.householdId, session.user.id);
    if (email) attendees = [{ email }];
  }

  const eventBody = {
    summary: block.title,
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
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });
    if (res.status === 404) eventId = null; // event was deleted in Google — recreate
  }
  if (!eventId) {
    res = await fetch(`${EVENTS}?${NOTIFY}`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });
  }
  const evJson = await res!.json();
  if (!evJson.id) {
    console.error("[calendar/blocks] gcal_write_failed", res!.status, JSON.stringify(evJson));
    return NextResponse.json({ error: "gcal_write_failed", detail: evJson }, { status: 502 });
  }

  await setBlockCalendarEvent(session.householdId, block.id, evJson.id);
  return NextResponse.json({ ok: true, eventId: evJson.id });
}
