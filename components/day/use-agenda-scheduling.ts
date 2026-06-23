"use client";

import { useMe } from "@/lib/queries/profiles";
import { useUpdateTask } from "@/lib/queries/tasks";
import { syncTaskCalendar } from "@/lib/queries/calendar";
import { DEFAULT_TIMEZONE, blockInstant, minutesFromMidnight } from "@/lib/date";
import type { Task } from "@/lib/queries/types";

const TZ = DEFAULT_TIMEZONE;

/** Clamp minutes-from-midnight to a valid HH:MM string. */
export function minutesToHHMM(min: number) {
  const m = Math.max(0, Math.min(min, 23 * 60 + 59));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Scheduling actions shared by the day's task list (drag a task onto the
 * calendar) and the agenda itself (time pickers, drag-move, resize, auto-pack).
 * Every write mirrors the change to Google Calendar when connected — failures
 * are swallowed so a calendar hiccup never blocks the optimistic update.
 */
export function useAgendaScheduling(date: string) {
  const update = useUpdateTask();
  const connected = !!useMe().data?.google_calendar_connected;

  function syncUpsert(taskId: string) {
    if (connected) syncTaskCalendar({ action: "upsert", taskId }).catch(() => {});
  }

  function durationOf(task: Task) {
    if (task.block_start && task.block_end) {
      return minutesFromMidnight(task.block_end, TZ) - minutesFromMidnight(task.block_start, TZ);
    }
    return task.time_estimate_min ?? 30;
  }

  /** Set an explicit start/end block (used by drag-move and resize). */
  function setBlock(task: Task, startMin: number, endMin: number) {
    update.mutate(
      {
        task,
        patch: {
          block_start: blockInstant(date, minutesToHHMM(startMin), TZ),
          block_end: blockInstant(date, minutesToHHMM(endMin), TZ),
        },
      },
      { onSuccess: () => syncUpsert(task.id) },
    );
  }

  /** Place a task starting at `startMin`, keeping its current duration. */
  function scheduleAt(task: Task, startMin: number) {
    setBlock(task, startMin, startMin + durationOf(task));
  }

  function unschedule(task: Task) {
    const eventId = task.gcal_event_id;
    update.mutate(
      { task, patch: { block_start: null, block_end: null, gcal_event_id: null } },
      {
        onSuccess: () => {
          if (connected && eventId) syncTaskCalendar({ action: "delete", eventId }).catch(() => {});
        },
      },
    );
  }

  return { scheduleAt, setBlock, unschedule, durationOf, connected };
}
