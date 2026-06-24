"use client";

import { useMe } from "@/lib/queries/profiles";
import { useCreateBlock, useDeleteBlock, useUpdateBlock } from "@/lib/queries/task-blocks";
import { syncBlockCalendar } from "@/lib/queries/calendar";
import { blockDurationMin } from "@/lib/scheduling";
import { DEFAULT_TIMEZONE, blockInstant, minutesFromMidnight } from "@/lib/date";
import type { Task, TaskBlock } from "@/lib/queries/types";

const TZ = DEFAULT_TIMEZONE;

/** Clamp minutes-from-midnight to a valid HH:MM string. */
export function minutesToHHMM(min: number) {
  const m = Math.max(0, Math.min(min, 23 * 60 + 59));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Scheduling actions over a task's time-blocks. A task can have several blocks
 * (split a long task into sessions): dragging from the list creates a new
 * block; dragging/resizing a block edits that one; the X removes that session.
 * Each block mirrors to Google Calendar as its own event when connected —
 * failures are swallowed so a calendar hiccup never blocks the optimistic UI.
 */
export function useAgendaScheduling(date: string) {
  const create = useCreateBlock(date);
  const update = useUpdateBlock(date);
  const remove = useDeleteBlock(date);
  const connected = !!useMe().data?.google_calendar_connected;

  function syncUpsert(blockId: string) {
    if (connected) syncBlockCalendar({ action: "upsert", blockId }).catch(() => {});
  }

  /** Create a new block for a task spanning [startMin, startMin+durMin). */
  function scheduleNewBlock(task: Task, startMin: number, durMin: number) {
    create.mutate(
      {
        taskId: task.id,
        startISO: blockInstant(date, minutesToHHMM(startMin), TZ),
        endISO: blockInstant(date, minutesToHHMM(startMin + durMin), TZ),
      },
      { onSuccess: (block) => syncUpsert(block.id) },
    );
  }

  /** Move a block to a new start, keeping its duration. */
  function moveBlock(block: TaskBlock, startMin: number) {
    const dur = blockDurationMin(block);
    update.mutate(
      {
        block,
        startISO: blockInstant(date, minutesToHHMM(startMin), TZ),
        endISO: blockInstant(date, minutesToHHMM(startMin + dur), TZ),
      },
      { onSuccess: (b) => syncUpsert(b.id) },
    );
  }

  /** Resize a block: keep its start, set a new end. */
  function resizeBlock(block: TaskBlock, endMin: number) {
    update.mutate(
      {
        block,
        startISO: block.start_at,
        endISO: blockInstant(date, minutesToHHMM(endMin), TZ),
      },
      { onSuccess: (b) => syncUpsert(b.id) },
    );
  }

  /** Remove one block (and its calendar event). */
  function removeBlock(block: TaskBlock) {
    const eventId = block.gcal_event_id;
    remove.mutate(block, {
      onSuccess: () => {
        if (connected && eventId) syncBlockCalendar({ action: "delete", eventId }).catch(() => {});
      },
    });
  }

  return { scheduleNewBlock, moveBlock, resizeBlock, removeBlock, connected };
}

/** Minutes-from-midnight of a block's start, in the household timezone. */
export function blockStartMin(block: TaskBlock): number {
  return minutesFromMidnight(block.start_at, TZ);
}

/** Minutes-from-midnight of a block's end, in the household timezone. */
export function blockEndMin(block: TaskBlock): number {
  return minutesFromMidnight(block.end_at, TZ);
}
