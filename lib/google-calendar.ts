import "server-only";
import { disconnectGoogleCalendar, getGoogleRefreshToken } from "@/lib/db/queries/google";
import { refreshGoogleAccessToken } from "@/lib/google";

export type CalendarAccess =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "not_connected" | "reconnect" | "refresh_failed" };

/**
 * A usable Google access token for this person, or why there is none.
 *
 * A dead refresh token (`invalid_grant`) disconnects the calendar on the spot,
 * the same way the Settings button does: the profile is the only thing the app
 * reads to decide whether someone is connected, and while it said "yes" over a
 * token Google had already revoked, Settings kept hiding the Connect button
 * and every calendar view kept asking for events and failing. Keyed by user,
 * like the rest of the Calendar link: it is one person's grant, never the
 * household's.
 */
export async function calendarAccessToken(userId: string): Promise<CalendarAccess> {
  const refreshToken = await getGoogleRefreshToken(userId);
  if (!refreshToken) return { ok: false, reason: "not_connected" };

  const result = await refreshGoogleAccessToken(refreshToken);
  if (result.ok) return { ok: true, accessToken: result.accessToken };
  if (result.revoked) {
    await disconnectGoogleCalendar(userId);
    return { ok: false, reason: "reconnect" };
  }
  return { ok: false, reason: "refresh_failed" };
}

/**
 * The response for a calendar route that could not get a token. `reconnect`
 * gets its own status, 409, so the client can tell "you need to connect again"
 * (stop asking, refresh the profile) from "Google had a bad moment" (502).
 */
export function calendarAccessFailure(reason: "not_connected" | "reconnect" | "refresh_failed") {
  if (reason === "reconnect") {
    return Response.json({ error: "reconnect", reconnect: true }, { status: 409 });
  }
  if (reason === "not_connected") {
    return Response.json({ error: "not_connected" }, { status: 400 });
  }
  return Response.json({ error: "token_refresh_failed" }, { status: 502 });
}

const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/**
 * Removes the calendar events of blocks that were just deleted.
 *
 * Runs on the server, with ids read from this household's own `task_blocks`
 * rows before they were deleted. It used to be a browser call that sent an
 * event id to `/api/calendar/blocks`, which then deleted *whatever* id it was
 * given from the person's primary calendar: their dentist appointment
 * included, if anything ever sent that id. Ids that only ever come from our
 * rows can only ever be events this app wrote.
 *
 * Best effort: the blocks are already gone, and a calendar that cannot be
 * reached leaves an orphan event rather than an error on a delete that worked.
 */
export async function deleteCalendarEvents(userId: string, eventIds: string[]) {
  if (eventIds.length === 0) return;
  const access = await calendarAccessToken(userId);
  if (!access.ok) return;
  await Promise.allSettled(
    eventIds.map((id) =>
      // sendUpdates=all so an invited partner gets the cancellation too.
      fetch(`${EVENTS}/${encodeURIComponent(id)}?sendUpdates=all`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${access.accessToken}` },
      }),
    ),
  );
}
