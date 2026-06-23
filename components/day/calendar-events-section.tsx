"use client";

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { useMe } from "@/lib/queries/profiles";
import { useCalendarEvents } from "@/lib/queries/calendar";
import { DEFAULT_TIMEZONE, minutesFromMidnight, timeInTimeZone } from "@/lib/date";
import type { Task } from "@/lib/queries/types";

const TZ = DEFAULT_TIMEZONE;

/**
 * Read-only list of the day's Google Calendar events, shown inside the day so
 * meetings are part of your plan (Sunsama-style) — not just drawn on the agenda
 * grid. Events we created from our own time-blocks are hidden (the task already
 * represents them). Purely informational: no toggling, editing or dragging.
 */
export function CalendarEventsSection({ date, tasks }: { date: string; tasks: Task[] }) {
  const connected = !!useMe().data?.google_calendar_connected;
  const calendarQ = useCalendarEvents(date, connected);

  const ownEventIds = useMemo(
    () => new Set(tasks.map((t) => t.gcal_event_id).filter((id): id is string => !!id)),
    [tasks],
  );

  const events = useMemo(() => {
    return (calendarQ.data ?? [])
      .filter((e) => !ownEventIds.has(e.id))
      .sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1; // all-day first
        const am = a.start ? minutesFromMidnight(a.start, TZ) : 0;
        const bm = b.start ? minutesFromMidnight(b.start, TZ) : 0;
        return am - bm;
      });
  }, [calendarQ.data, ownEventIds]);

  if (!connected || events.length === 0) return null;

  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        De tu calendario
      </h2>
      <ul className="flex flex-col gap-1.5">
        {events.map((e) => {
          const color = e.color ?? "#94a3b8";
          return (
            <li
              key={e.id}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-surface/60 py-2 pr-3 pl-2.5"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm text-muted">{e.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-subtle">
                {e.allDay
                  ? "todo el día"
                  : e.start
                    ? `${timeInTimeZone(e.start, TZ)}${e.end ? `–${timeInTimeZone(e.end, TZ)}` : ""}`
                    : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
