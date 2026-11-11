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
import { useToast } from "@/lib/stores/toast";
import { useMe } from "@/lib/queries/profiles";
import { useDailyNote, useUpsertDailyNote } from "@/lib/queries/daily-notes";
import { useCalendarEvents } from "@/lib/queries/calendar";
import type { Channel, Task, TaskBlock } from "@/lib/queries/types";
import { DEFAULT_TIMEZONE, minutesFromMidnight, timeInTimeZone, todayISO } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import {
  DEFAULT_END_TARGET_MIN,
  firstFreeSlot,
  freeSlots,
  nextBlockDurationMin,
  remainingMin,
  showInUnscheduled,
  type BusyRange,
} from "@/lib/scheduling";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { CompactTaskRow } from "@/components/tasks/compact-task-row";
import { TimePicker } from "@/components/ui/time-picker";
import { ReplanPanel, type ReplanEvent } from "./replan-panel";
import {
  blockEndMin,
  blockStartMin,
  minutesToHHMM,
  useAgendaScheduling,
} from "./use-agenda-scheduling";
import { useTranslations } from "next-intl";

const START_HOUR = 6;
const END_HOUR = 24;
/** One hour of the day: the canvas's 56px. The card is a fixed 476px window
 *  (eight hours) that scrolls over the full 06–24 day. */
const PX_PER_HOUR = 56;
/** Where the first hour line sits inside the card, as on the canvas. */
const GRID_TOP = 20;
/** Blocks stop 4px short of their end so back-to-back ones read as two. */
const BLOCK_GAP_PX = 4;
/** Below this a block can't hold title and time on two lines (a 30m block is
 *  24px), so they share one, centred, instead of the time being clipped. */
const TWO_LINE_MIN_PX = 46;
/** The canvas's four pastels, handed out by category order so a category keeps
 *  its colour all day. Tasks without a category take the last one. */
const PASTELS = ["bg-agenda-1", "bg-agenda-2", "bg-agenda-3", "bg-agenda-4"] as const;

/** y for a minute-of-day inside the scrolling grid. */
function yFor(min: number) {
  return GRID_TOP + ((min - START_HOUR * 60) / 60) * PX_PER_HOUR;
}
/** The window we look for openings in — nobody wants "hay un hueco a las 6am". */
const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 21 * 60;
const SLOT_MIN = 30;
const RESIZE_SNAP_MIN = 15;
const MIN_BLOCK_MIN = 15;
const TZ = DEFAULT_TIMEZONE;

/**
 * The day's calendar. Each time-block is drawn as a draggable/resizable card; a
 * task can have several. Dragging a task from the list creates a new block;
 * dragging a block moves it. The drop slots and dragged items are wired through
 * a DndContext owned by the parent day view.
 */
export function AgendaView({
  date,
  tasks,
  blocksByTask,
  channelsById,
  activeTask,
  activeBlockId,
  replanOpen,
  onReplanOpenChange,
}: {
  date: string;
  tasks: Task[];
  blocksByTask: Map<string, TaskBlock[]>;
  channelsById: Map<string, Channel>;
  /** The task/block currently being dragged in the parent context (null when idle). */
  activeTask: Task | null;
  activeBlockId: string | null;
  /** "Reacomodar desde ahora" lives in the day's header; it owns the sheet's
   *  open state, the agenda supplies the data. */
  replanOpen?: boolean;
  onReplanOpenChange?: (open: boolean) => void;
}) {
  const td = useTranslations("day");
  const me = useMe().data;
  const { scheduleNewBlock, moveBlock, resizeBlock, removeBlock, connected } =
    useAgendaScheduling(date);
  const calendarQ = useCalendarEvents(date, connected);
  // Hide events we created from our own blocks — they're already drawn as
  // planned blocks, so this avoids showing each synced session twice.
  const ownEventIds = useMemo(() => {
    const s = new Set<string>();
    for (const arr of blocksByTask.values())
      for (const b of arr) if (b.gcal_event_id) s.add(b.gcal_event_id);
    return s;
  }, [blocksByTask]);
  const events = useMemo(
    () => (calendarQ.data ?? []).filter((e) => !ownEventIds.has(e.id)),
    [calendarQ.data, ownEventIds],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  // Category → pastel, by the categories' own order (stable across days).
  const pastelFor = useMemo(() => {
    const order = [...channelsById.values()].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
    );
    const idx = new Map(order.map((c, i) => [c.id, i]));
    return (channelId: string | null) => {
      const i = channelId != null ? idx.get(channelId) : undefined;
      return i == null ? PASTELS[3] : PASTELS[i % PASTELS.length];
    };
  }, [channelsById]);
  const noteQ = useDailyNote(date);
  const upsertNote = useUpsertDailyNote(date);
  const toast = useToast();
  const targetMin = noteQ.data?.end_target_min ?? DEFAULT_END_TARGET_MIN;

  // Every block of every task, flattened and sorted by start, for the grid.
  const scheduled = useMemo(() => {
    const items: { task: Task; block: TaskBlock }[] = [];
    for (const task of tasks) {
      for (const block of blocksByTask.get(task.id) ?? []) items.push({ task, block });
    }
    return items.sort((a, b) => blockStartMin(a.block) - blockStartMin(b.block));
  }, [tasks, blocksByTask]);

  // Tasks with time still to place (keep showing until blocks cover the estimate).
  const unscheduled = useMemo(
    () => tasks.filter((t) => showInUnscheduled(t.time_estimate_min, blocksByTask.get(t.id) ?? [])),
    [tasks, blocksByTask],
  );

  // Calendar events with a time, as busy ranges. Replanning packs around these
  // and nothing else from Google: they're the walls you can't move from here.
  const eventBusy: ReplanEvent[] = useMemo(() => {
    const ranges: ReplanEvent[] = [];
    for (const e of events) {
      if (e.allDay || !e.start) continue;
      const startMin = minutesFromMidnight(e.start, TZ);
      ranges.push({
        startMin,
        endMin: e.end ? minutesFromMidnight(e.end, TZ) : startMin + 30,
        title: e.title,
      });
    }
    return ranges;
  }, [events]);

  // Everything that occupies the day, blocks and calendar events alike — the
  // openings have to account for both or "hueco de 1h" is a lie.
  const busy: BusyRange[] = useMemo(
    () => [
      ...scheduled.map(({ block }) => ({
        startMin: blockStartMin(block),
        endMin: blockEndMin(block),
      })),
      ...eventBusy,
    ],
    [scheduled, eventBusy],
  );

  const openings = useMemo(() => freeSlots(busy, DAY_START_MIN, DAY_END_MIN, 30), [busy]);

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
  // Open the window on the hour of the first block (09:00 at the latest), with
  // that hour's line where the canvas puts its first one — not at 06:00, the
  // early hours are almost always empty.
  const firstMin = scheduled.length ? blockStartMin(scheduled[0].block) : 9 * 60;
  const firstMinRef = useRef(firstMin);
  useEffect(() => {
    firstMinRef.current = firstMin;
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Applied once, when the window first has a size: on a phone the agenda
    // is a hidden tab at mount (display: none ignores scrollTop), and even on
    // desktop the first effect could land before layout and leave it at 06:00.
    // Once you've scrolled, the agenda shouldn't jump back.
    const apply = () => {
      if (el.clientHeight === 0) return false;
      const fromHour = Math.floor(Math.min(firstMinRef.current, 9 * 60) / 60);
      el.scrollTop = Math.max(0, (fromHour - START_HOUR) * PX_PER_HOUR);
      return true;
    };
    if (apply()) return;
    const ro = new ResizeObserver(() => {
      if (apply()) ro.disconnect();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const showNow = hydrated && isToday && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;
  const nowTop = yFor(nowMin);

  function schedule(task: Task, time: string) {
    const [h, m] = time.split(":").map(Number);
    const dur = nextBlockDurationMin(task.time_estimate_min, blocksByTask.get(task.id) ?? []);
    scheduleNewBlock(task, h * 60 + m, dur);
  }

  /** Where this task would go if you just tapped it: the first real opening
   *  long enough to hold it. null when the day genuinely has no room. */
  function nextSlotFor(task: Task): number | null {
    const dur = nextBlockDurationMin(task.time_estimate_min, blocksByTask.get(task.id) ?? []);
    return firstFreeSlot(busy, dur, DAY_START_MIN, DAY_END_MIN);
  }

  function scheduleInFirstSlot(task: Task) {
    const startMin = nextSlotFor(task);
    if (startMin == null) return;
    const dur = nextBlockDurationMin(task.time_estimate_min, blocksByTask.get(task.id) ?? []);
    scheduleNewBlock(task, startMin, dur);
    toast(td("scheduledAtToast", { time: minutesToHHMM(startMin) }));
  }

  const myUnscheduled = unscheduled.filter((t) => t.owner_id === me?.id && t.status === "todo");

  // The opening worth pointing at: the first one big enough for the next thing
  // you'd schedule. No loose tasks → no hint, since there'd be nothing to drop.
  const suggestedGap = useMemo(() => {
    if (myUnscheduled.length === 0) return null;
    const needed = Math.min(
      ...myUnscheduled.map((t) =>
        nextBlockDurationMin(t.time_estimate_min, blocksByTask.get(t.id) ?? []),
      ),
    );
    return openings.find((slot) => slot.lenMin >= needed) ?? null;
  }, [myUnscheduled, openings, blocksByTask]);

  // Pack my still-unscheduled time back-to-back so the last block ends at target.
  function autoSchedule() {
    if (myUnscheduled.length === 0) return;
    const durations = myUnscheduled.map((t) =>
      nextBlockDurationMin(t.time_estimate_min, blocksByTask.get(t.id) ?? []),
    );
    const total = durations.reduce((sum, d) => sum + d, 0);
    let cursor = targetMin - total;
    myUnscheduled.forEach((t, i) => {
      scheduleNewBlock(t, cursor, durations[i]);
      cursor += durations[i];
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {hydrated && isToday && replanOpen && (
        <ReplanPanel
          date={date}
          tasks={tasks}
          blocksByTask={blocksByTask}
          calendarEvents={eventBusy}
          nowMin={nowMin}
          endMin={targetMin}
          meId={me?.id}
          moveBlock={moveBlock}
          scheduleNewBlock={scheduleNewBlock}
          toneFor={(task) => pastelFor(task.channel_id)}
          onClose={() => onReplanOpenChange?.(false)}
        />
      )}

      {/* On desktop the full task list on the left is the drag source, so this
          compact list is only needed on mobile (where list + agenda are tabs). */}
      {unscheduled.length > 0 && (
        <section className="flex flex-col gap-1 rounded-[22px] bg-surface p-3 shadow-tile lg:hidden">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">
            {td("unscheduledHint")}
          </p>
          {unscheduled.map((t) => {
            const rem = remainingMin(t.time_estimate_min, blocksByTask.get(t.id) ?? []);
            const hasBlocks = (blocksByTask.get(t.id) ?? []).length > 0;
            return (
              <div key={t.id} className="flex items-center gap-2">
                <DragHandle task={t} />
                <div className="min-w-0 flex-1">
                  <CompactTaskRow
                    task={t}
                    channel={t.channel_id ? channelsById.get(t.channel_id) : undefined}
                  />
                </div>
                {hasBlocks && rem != null && (
                  <span className="shrink-0 text-2xs font-medium text-accent">
                    {td("remaining", { time: formatMinutes(rem) })}
                  </span>
                )}
                {/* One tap drops it in the first real opening; the picker is
                    still there for "no, at 16:00". */}
                {(() => {
                  const slot = nextSlotFor(t);
                  return slot == null ? null : (
                    <button
                      onClick={() => scheduleInFirstSlot(t)}
                      className="shrink-0 cursor-pointer rounded-pill bg-primary/12 px-2.5 py-1 text-2xs font-bold tabular-nums text-primary transition-colors hover:bg-primary hover:text-on-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                    >
                      {td("scheduleAt", { time: minutesToHHMM(slot) })}
                    </button>
                  );
                })()}
                <TimePicker
                  value={null}
                  placeholder={td("otherTime")}
                  align="right"
                  onChange={(v) => schedule(t, v)}
                  className="shrink-0"
                />
              </div>
            );
          })}
        </section>
      )}

      <div className="overflow-hidden rounded-[22px] bg-surface">
        {events.filter((e) => e.allDay).length > 0 && (
          <div className="mx-3 mt-3 flex flex-col gap-1 border-b border-border pb-3">
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
                  <span className="ml-auto shrink-0 text-2xs text-subtle">{td("allDayEvent")}</span>
                </div>
              ))}
          </div>
        )}
        {/* The full day scrolls inside the canvas's fixed 476px window, opened
            at the morning, so the card measures the same whatever the day holds. */}
        <div ref={scrollRef} className="h-[476px] overflow-y-auto">
          <div
            className="relative"
            style={{ height: (END_HOUR - START_HOUR) * PX_PER_HOUR + GRID_TOP * 2 }}
          >
            {hours.map((h) => {
              // The hour you said you want to be done — the one line on the grid
              // that is a decision rather than a tick mark.
              const isTarget = h === Math.floor(targetMin / 60);
              return (
                <div
                  key={h}
                  className="absolute right-3 left-3 flex items-center gap-2.5"
                  style={{ top: yFor(h * 60) - 8 }}
                >
                  <span
                    className={cn(
                      "w-9 shrink-0 font-mono text-[11px] leading-4",
                      isTarget ? "font-bold text-accent" : "text-subtle",
                    )}
                  >
                    {String(h).padStart(2, "0")}:00
                  </span>
                  <span
                    className={cn(
                      "flex-1",
                      isTarget ? "border-t border-dashed border-accent/50" : "h-px bg-surface-2",
                    )}
                  />
                </div>
              );
            })}

            {/* The first opening that would actually hold something, drawn where
              it is. Only while there's something to put in it. */}
            {suggestedGap && activeTask && (
              <div
                className="pointer-events-none absolute right-3.5 left-[58px] z-0 flex items-center justify-center rounded-[14px] border-[1.5px] border-dashed border-primary bg-primary/[0.07] px-2 text-2xs font-semibold text-primary"
                style={{
                  top: yFor(suggestedGap.startMin),
                  height: Math.max((suggestedGap.lenMin / 60) * PX_PER_HOUR, 28),
                }}
                aria-hidden
              >
                {td("gapHint", { length: formatMinutes(suggestedGap.lenMin) })}
              </div>
            )}

            {/* Drop slots (every 30 min) — receive dragged tasks/blocks. */}
            {slots.map((min) => (
              <DropSlot key={min} min={min} dragging={!!activeTask} />
            ))}

            {/* Google Calendar events (read-only) — under the planned blocks. */}
            {events
              .filter((e) => !e.allDay && e.start)
              .map((e) => {
                const sMin = minutesFromMidnight(e.start!, TZ);
                const eMin = e.end ? minutesFromMidnight(e.end, TZ) : sMin + 30;
                const top = Math.max(GRID_TOP, yFor(sMin));
                const height = Math.max(((eMin - sMin) / 60) * PX_PER_HOUR - BLOCK_GAP_PX, 24);
                const ec = e.color ?? "#94a3b8";
                return (
                  <div
                    key={e.id}
                    className="pointer-events-none absolute right-3.5 left-[58px] z-[1] overflow-hidden rounded-[14px] px-3 py-1.5 text-[13px]"
                    style={{
                      top,
                      height,
                      boxSizing: "border-box",
                      backgroundColor: "var(--color-surface)",
                      borderColor: `color-mix(in srgb, ${ec} 45%, var(--color-surface))`,
                      borderWidth: 1.5,
                      borderStyle: "dashed",
                    }}
                  >
                    <span className="block truncate font-medium text-muted">{e.title}</span>
                    <span className="font-mono text-[11px] text-subtle">
                      {timeInTimeZone(e.start!, TZ)}
                      {e.end ? `–${timeInTimeZone(e.end, TZ)}` : ""}
                    </span>
                  </div>
                );
              })}

            {scheduled.map(({ task, block }, i) => (
              <ScheduledBlock
                key={block.id}
                task={task}
                block={block}
                pastel={pastelFor(task.channel_id)}
                delayMs={400 + Math.min(i, 6) * 80}
                onUnschedule={() => removeBlock(block)}
                onResize={(endMin) => resizeBlock(block, endMin)}
                dragging={activeBlockId === block.id}
              />
            ))}

            {showNow && (
              // z-[5] keeps it UNDER the blocks (z-10): drawn over them it read
              // as a strikethrough across whatever you're doing right now.
              <div
                className="pointer-events-none absolute right-3 left-[50px] z-[5] flex items-center"
                style={{ top: nowTop - 5 }}
                aria-hidden
              >
                <span className="h-2.5 w-2.5 shrink-0 animate-now rounded-full bg-accent" />
                <span className="h-0.5 flex-1 bg-accent" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The day's end and the packer, kept quiet at the foot: the canvas has
          the agenda as just the day, and these are tools you reach for. */}
      <div className="flex flex-wrap items-center gap-2 px-2 text-xs text-muted">
        <span>{td("endAt")}</span>
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
          className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-3 py-1.5 font-semibold text-fg transition-colors hover:bg-surface disabled:cursor-default disabled:opacity-40"
        >
          <Wand2 className="h-3.5 w-3.5" aria-hidden />
          {td("autoSchedule")}
        </button>
      </div>
    </div>
  );
}

function DragHandle({ task }: { task: Task }) {
  const td = useTranslations("day");
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `task-${task.id}`,
    data: { task },
  });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={td("dragToCalendar")}
      className="shrink-0 cursor-grab touch-none text-subtle/70 transition-colors hover:text-muted active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}

function DropSlot({ min, dragging }: { min: number; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${min}` });
  const top = yFor(min);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute right-3.5 left-[58px] z-30 rounded-[14px] transition-colors",
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
  block,
  pastel,
  delayMs,
  onUnschedule,
  onResize,
  dragging,
}: {
  task: Task;
  block: TaskBlock;
  /** The category's pastel utility (bg-agenda-N). */
  pastel: string;
  /** Entry cascade delay, as on the canvas (400ms + 80ms per block). */
  delayMs: number;
  onUnschedule: () => void;
  onResize: (endMin: number) => void;
  dragging: boolean;
}) {
  const td = useTranslations("day");
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `block-${block.id}`,
    data: { block, task },
  });
  const startMin = blockStartMin(block);
  const endMin = blockEndMin(block);

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

  const top = Math.max(GRID_TOP, yFor(startMin));
  const height = Math.max(((shownEnd - startMin) / 60) * PX_PER_HOUR - BLOCK_GAP_PX, 20);
  const resizing = draftEnd != null;
  const oneLine = height < TWO_LINE_MIN_PX;
  const range = td("agendaRange", {
    from: minutesToHHMM(startMin),
    to: minutesToHHMM(shownEnd),
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group absolute right-3.5 left-[58px] z-10 flex animate-up cursor-grab touch-none flex-col gap-px overflow-hidden rounded-[14px] px-3 active:cursor-grabbing",
        oneLine ? "justify-center" : "py-2",
        pastel,
        dragging && "opacity-40",
        resizing && "ring-2 ring-primary",
      )}
      style={{ top, height, boxSizing: "border-box", animationDelay: `${delayMs}ms` }}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[13px] leading-4 font-semibold text-fg">
          {task.title}
        </span>
        {oneLine && (
          <span className="shrink-0 font-mono text-[11px] leading-4 text-muted">{range}</span>
        )}
        <button
          onClick={onUnschedule}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={td("removeBlock")}
          className="shrink-0 cursor-pointer self-center text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100 touch:opacity-100"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>
      {!oneLine && <span className="font-mono text-[11px] leading-4 text-muted">{range}</span>}

      {/* Resize handle (drag the bottom edge to change the duration). */}
      <div
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        aria-label={td("resizeBlock")}
        className="absolute inset-x-0 bottom-0 h-2.5 cursor-ns-resize touch-none"
      >
        <span className="mx-auto mt-0.5 block h-1 w-8 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-30" />
      </div>
    </div>
  );
}
