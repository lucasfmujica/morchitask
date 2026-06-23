import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_TIMEZONE, addDays, blockInstant } from "@/lib/date";

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

/**
 * Push a task's time-block to Google Calendar (2-way sync, via the write edge
 * function). Fire-and-forget from the UI — callers catch errors so a calendar
 * hiccup never blocks the snappy optimistic update. No-op for users who haven't
 * connected (the function returns `not_connected`).
 */
export async function syncTaskCalendar(
  payload: { action: "upsert"; taskId: string } | { action: "delete"; eventId: string },
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.functions.invoke("google-calendar-write", { body: payload });
  if (error) throw error;
}

/** Google Calendar events for `date` (read-only, via the edge function). */
export function useCalendarEvents(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ["calendar", date],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CalendarEvent[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("google-calendar", {
        body: {
          timeMin: blockInstant(date, "00:00", TZ),
          timeMax: blockInstant(addDays(date, 1), "00:00", TZ),
        },
      });
      if (error) throw error;
      return (data?.events ?? []) as CalendarEvent[];
    },
  });
}
