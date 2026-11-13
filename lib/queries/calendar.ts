import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_TIMEZONE, addDays, blockInstant } from "@/lib/date";
import { profileKeys } from "./profiles";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  htmlLink: string | null;
  calendar?: string | null;
  color?: string | null;
};

const TZ = DEFAULT_TIMEZONE;

/** The calendar routes answer 409 when Google no longer accepts the stored
 *  grant: "connect again", which the client treats as not connected. */
export function calendarNeedsReconnect(status: number): boolean {
  return status === 409;
}

/**
 * Push a single time-block to Google Calendar (2-way sync). Each block is its
 * own calendar event; `upsert` by blockId stores the event id back on the
 * block. Deleting is not here: the server does it when the block goes, from
 * the id on its own row. Fire-and-forget from the UI — callers catch errors so
 * a calendar hiccup never blocks the snappy optimistic update.
 */
export async function syncBlockCalendar(payload: {
  action: "upsert";
  blockId: string;
}): Promise<void> {
  const res = await fetch("/api/calendar/blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`calendar sync failed: ${res.status}`);
}

/** Google Calendar events for `date` (read-only). */
export function useCalendarEvents(date: string, enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["calendar", date],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CalendarEvent[]> => {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: blockInstant(date, "00:00", TZ),
          timeMax: blockInstant(addDays(date, 1), "00:00", TZ),
        }),
      });
      if (calendarNeedsReconnect(res.status)) {
        // Google revoked the grant and the server has already marked the
        // calendar disconnected. Refetching the profile is what flips every
        // `connected` check (and Settings' Connect button) without a reload;
        // until then, no events is the honest answer, not an error.
        qc.invalidateQueries({ queryKey: profileKeys.me });
        return [];
      }
      if (!res.ok) throw new Error(`calendar fetch failed: ${res.status}`);
      const data = await res.json();
      return (data?.events ?? []) as CalendarEvent[];
    },
  });
}
