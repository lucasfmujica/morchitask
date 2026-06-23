"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, Wand2, X } from "lucide-react";
import { useMe } from "@/lib/queries/profiles";
import { useDailyNote, useUpsertDailyNote } from "@/lib/queries/daily-notes";
import { useCalendarEvents } from "@/lib/queries/calendar";
import type { Channel, Task } from "@/lib/queries/types";
import { DEFAULT_TIMEZONE, minutesFromMidnight, timeInTimeZone, todayISO } from "@/lib/date";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { CompactTaskRow } from "@/components/tasks/compact-task-row";
import { TimePicker } from "@/components/ui/time-picker";
import { minutesToHHMM, useAgendaScheduling } from "./use-agenda-scheduling";

const DEFAULT_TARGET_MIN = 18 * 60; // 18:00

const START_HOUR = 6;
const END_HOUR = 24;
const PX_PER_HOUR = 56;
const SLOT_MIN = 30;
const RESIZE_SNAP_MIN = 15;
const MIN_BLOCK_MIN = 15;
const TZ = DEFAULT_TIMEZONE;

/**
 * The day's calendar. Time-blocks are drawn as draggable/resizable cards; the
 * drop slots and dragged tasks are wired through a DndContext owned by the
 * parent day view, so tasks can be dragged straight from the list on the left.
 */
export function AgendaView({
  date,
  tasks,
  channelsById,
  activeTask,
}: {
  date: string;
  tasks: Task[];
  channelsById: Map<string, Channel>;
  /** The task currently being dragged in the parent context (null when idle). */
  activeTask: Task | null;
}) {
  const me = useMe().data;
  const { setBlock, unschedule, connected } = useAgendaScheduling(date);
  const calendarQ = useCalendarEvents(date, connected);
  // Hide events we created from our own time-blocks — they're already drawn as
  // planned blocks, so this avoids showing each synced task twice.
  const ownEventIds = useMemo(
    () => new Set(tasks.map((t) => t.gcal_event_id).filter((id): id is string => !!id)),
    [tasks],
  );
  const events = useMemo(
    () => (calendarQ.data ?? []).filter((e) => !ownEventIds.has(e.id)),
    [calendarQ.data, ownEventIds],
  );
  const noteQ = useDailyNote(date);
  const upsertNote = useUpsertDailyNote(date);
  const targetMin = noteQ.data?.end_target_min ?? DEFAULT_TARGET_MIN;

  const scheduled = useMemo(
    () =>
      tasks
        .filter((t) => t.block_start)
        .sort(
          (a, b) =>
            minutesFromMidnight(a.block_start!, TZ) - minutesFromMidnight(b.block_start!, TZ),
        ),
    [tasks],
  );
  const unscheduled = useMemo(() => tasks.filter((t) => !t.block_start), [tasks]);
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const slots = Array.from(
    { length: ((END_HOUR - START_HOUR) * 60) / SLOT_MIN },
    (_, i) => START_HOUR * 60 + i * SLOT_MIN,
  );

  // "Now" indicator (only for today, ticking each minute).
  const hydrated = useHydrated();
  const isToday = date === todayISO();
  const [nowMin, setNowMin] = useState(() => minutesFromMidnight(new Date().toISOString(), TZ));
  useEffect(() => {
    const id = setInterval(
      () => setNowMin(minutesFromMidnight(new Date().toISOString(), TZ)),
      60_000,
    );
    return () => clearInterval(id);
  }, []);
  const showNow = hydrated && isToday && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;
  const nowTop = ((nowMin - START_HOUR * 60) / 60) * PX_PER_HOUR;

  function schedule(task: Task, time: string) {
    const [h, m] = time.split(":").map(Number);
    const start = h * 60 + m;
    const dur =
      task.block_start && task.block_end
        ? minutesFromMidnight(task.block_end, TZ) - minutesFromMidnight(task.block_start, TZ)
        : (task.time_estimate_min ?? 30);
    setBlock(task, start, start + dur);
  }

  // Pack my unscheduled tasks back-to-back so the last one ends at the target time.
  function autoSchedule() {
    const mine = unscheduled.filter((t) => t.owner_id === me?.id && t.status === "todo");
    if (mine.length === 0) return;
    const total = mine.reduce((sum, t) => sum + (t.time_estimate_min ?? 30), 0);
    let cursor = targetMin - total;
    for (const t of mine) {
      const dur = t.time_estimate_min ?? 30;
      setBlock(t, cursor, cursor + dur);
      cursor += dur;
    }
  }

  const myUnscheduled = unscheduled.filter((t) => t.owner_id === me?.id && t.status === "todo");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-card border border-border bg-surface p-3 shadow-soft">
        <span className="text-sm text-muted">Terminar a las</span>
        <TimePicker
          value={minutesToHHMM(targetMin)}
          onChange={(v) => {
            const [h, m] = v.split(":").map(Number);
            upsertNote.mutate({ end_target_min: h * 60 + m });
          }}
        />
        <button
          onClick={autoSchedule}
          disabled={myUnscheduled.length === 0}
          className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          <Wand2 className="h-4 w-4" aria-hidden />
          Auto-agendar
        </button>
      </div>

      {/* On desktop the full task list on the left is the drag source, so this
          compact list is only needed on mobile (where list + agenda are tabs). */}
      {unscheduled.length > 0 && (
        <section className="flex flex-col gap-1 rounded-card border border-border bg-surface p-3 shadow-soft lg:hidden">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
            Sin horario · arrastrá al calendario
          </p>
          {unscheduled.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <DragHandle task={t} />
              <div className="min-w-0 flex-1">
                <CompactTaskRow
                  task={t}
                  channel={t.channel_id ? channelsById.get(t.channel_id) : undefined}
                />
              </div>
              <TimePicker
                value={null}
                placeholder="Agendar"
                align="right"
                onChange={(v) => schedule(t, v)}
                className="shrink-0"
              />
            </div>
          ))}
        </section>
      )}

      <div className="rounded-card border border-border bg-surface p-3 shadow-soft">
        {events.filter((e) => e.allDay).length > 0 && (
          <div className="mb-3 flex flex-col gap-1 border-b border-border pb-3">
            {events
              .filter((e) => e.allDay)
              .map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: e.color ?? "#94a3b8" }}
                    aria-hidden
                  />
                  <span className="truncate">{e.title}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-subtle">todo el día</span>
                </div>
              ))}
          </div>
        )}
        <div className="relative" style={{ height: (END_HOUR - START_HOUR) * PX_PER_HOUR }}>
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute inset-x-0 flex items-start gap-2"
              style={{ top: i * PX_PER_HOUR }}
            >
              <span className="-mt-1.5 w-10 shrink-0 text-right text-[11px] text-subtle">
                {String(h).padStart(2, "0")}:00
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
          ))}

          {/* Drop slots (every 30 min) — receive dragged tasks. */}
          {slots.map((min) => (
            <DropSlot key={min} min={min} dragging={!!activeTask} />
          ))}

          {/* Google Calendar events (read-only) — under the planned time-blocks. */}
          {events
            .filter((e) => !e.allDay && e.start)
            .map((e) => {
              const sMin = minutesFromMidnight(e.start!, TZ);
              const eMin = e.end ? minutesFromMidnight(e.end, TZ) : sMin + 30;
              const top = Math.max(0, ((sMin - START_HOUR * 60) / 60) * PX_PER_HOUR);
              const height = Math.max(((eMin - sMin) / 60) * PX_PER_HOUR, 22);
              const ec = e.color ?? "#94a3b8";
              return (
                <div
                  key={e.id}
                  className="pointer-events-none absolute right-1 left-12 z-0 overflow-hidden rounded-lg px-2 py-1 text-xs"
                  style={{
                    top,
                    height,
                    backgroundColor: `color-mix(in srgb, ${ec} 10%, var(--color-surface))`,
                    borderColor: `color-mix(in srgb, ${ec} 28%, var(--color-surface))`,
                    borderLeftColor: ec,
                    borderWidth: 1,
                    borderLeftWidth: 3,
                    borderStyle: "dashed",
                  }}
                >
                  <span className="block truncate font-medium text-muted">{e.title}</span>
                  <span className="text-[10px] text-subtle">
                    {timeInTimeZone(e.start!, TZ)}
                    {e.end ? `–${timeInTimeZone(e.end, TZ)}` : ""}
                  </span>
                </div>
              );
            })}

          {scheduled.map((t) => (
            <ScheduledBlock
              key={t.id}
              task={t}
              channel={t.channel_id ? channelsById.get(t.channel_id) : undefined}
              onUnschedule={() => unschedule(t)}
              onResize={(endMin) => setBlock(t, minutesFromMidnight(t.block_start!, TZ), endMin)}
              dragging={activeTask?.id === t.id}
            />
          ))}

          {showNow && (
            <div
              className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
              style={{ top: nowTop }}
              aria-hidden
            >
              <span className="ml-9 h-2 w-2 shrink-0 rounded-full bg-accent" />
              <span className="h-px flex-1 bg-accent" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DragHandle({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `task-${task.id}`,
    data: { task },
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Arrastrar al calendario"
      className="shrink-0 cursor-grab touch-none text-subtle/70 transition-colors hover:text-muted active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}

function DropSlot({ min, dragging }: { min: number; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${min}` });
  const top = ((min - START_HOUR * 60) / 60) * PX_PER_HOUR;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute right-1 left-12 z-30 rounded transition-colors",
        dragging && "outline-dashed outline-1 outline-transparent",
        isOver && "bg-primary-soft/70 outline-primary",
      )}
      style={{
        top,
        height: (SLOT_MIN / 60) * PX_PER_HOUR,
        pointerEvents: dragging ? "auto" : "none",
      }}
    />
  );
}

function ScheduledBlock({
  task,
  channel,
  onUnschedule,
  onResize,
  dragging,
}: {
  task: Task;
  channel?: Channel;
  onUnschedule: () => void;
  onResize: (endMin: number) => void;
  dragging: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `task-${task.id}`,
    data: { task },
  });
  const startMin = minutesFromMidnight(task.block_start!, TZ);
  const endMin = task.block_end ? minutesFromMidnight(task.block_end!, TZ) : startMin + 30;
  const done = task.status === "done";
  const tc = channel?.color ?? "var(--color-primary)";

  // Live resize: while dragging the bottom edge, render a draft end time and
  // commit on release. Manual pointer tracking (not dnd-kit) so it never fights
  // with the move-drag above.
  const [draftEnd, setDraftEnd] = useState<number | null>(null);
  const resize = useRef<{ startY: number; baseEnd: number } | null>(null);
  const shownEnd = draftEnd ?? endMin;

  function onResizeDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation(); // don't start the move-drag
    e.currentTarget.setPointerCapture(e.pointerId);
    resize.current = { startY: e.clientY, baseEnd: endMin };
    setDraftEnd(endMin);
  }
  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!resize.current) return;
    const deltaMin = ((e.clientY - resize.current.startY) / PX_PER_HOUR) * 60;
    const snapped = Math.round(deltaMin / RESIZE_SNAP_MIN) * RESIZE_SNAP_MIN;
    setDraftEnd(Math.max(startMin + MIN_BLOCK_MIN, resize.current.baseEnd + snapped));
  }
  function onResizeUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!resize.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    const next = draftEnd;
    resize.current = null;
    setDraftEnd(null);
    if (next != null && next !== endMin) onResize(next);
  }

  const top = Math.max(0, ((startMin - START_HOUR * 60) / 60) * PX_PER_HOUR);
  const height = Math.max(((shownEnd - startMin) / 60) * PX_PER_HOUR, 26);
  const resizing = draftEnd != null;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group absolute right-1 left-12 z-10 cursor-grab touch-none overflow-hidden rounded-lg px-2 py-1 text-xs active:cursor-grabbing",
        done && "opacity-60",
        dragging && "opacity-40",
        resizing && "ring-2 ring-primary",
      )}
      style={{
        top,
        height,
        backgroundColor: `color-mix(in srgb, ${tc} 16%, var(--color-surface))`,
        borderColor: `color-mix(in srgb, ${tc} 32%, var(--color-surface))`,
        borderLeftColor: tc,
        borderWidth: 1,
        borderLeftWidth: 3,
        borderStyle: "solid",
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className={cn("truncate font-medium text-fg", done && "line-through")}>
          {task.title}
        </span>
        <button
          onClick={onUnschedule}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Quitar horario"
          className="shrink-0 cursor-pointer text-muted hover:text-danger"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>
      <span className="text-[10px] text-muted">
        {minutesToHHMM(startMin)}–{minutesToHHMM(shownEnd)}
      </span>

      {/* Resize handle (drag the bottom edge to change the duration). */}
      <div
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        aria-label="Cambiar duración"
        className="absolute inset-x-0 bottom-0 h-2.5 cursor-ns-resize touch-none"
      >
        <span className="mx-auto mt-0.5 block h-1 w-8 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-30" />
      </div>
    </div>
  );
}
