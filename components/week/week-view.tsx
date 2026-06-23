"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical, Plus } from "lucide-react";
import { tasksForDateQueryOptions, useCreateTask, useMoveTaskToDate } from "@/lib/queries/tasks";
import { subtasksForDateQueryOptions } from "@/lib/queries/subtasks";
import { useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import { useProfiles } from "@/lib/queries/profiles";
import type { Channel, Profile, Subtask, Task } from "@/lib/queries/types";
import { addDays, todayISO, weekDayHeading, weekRange, weekRangeLabel } from "@/lib/date";
import { orderForAppend } from "@/lib/ordering";
import { filterTasksByChannels } from "@/lib/week-filter";
import { useChannelFilter } from "@/lib/channel-filter";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TaskCard } from "@/components/tasks/task-card";
import { DayProgressBar } from "./day-progress-bar";

const arrow =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

const NO_SUBTASKS = new Map<string, Subtask[]>();

/** Horizontal distance between two day panels (panel width + gap), measured
 *  from the live DOM so it works at every breakpoint. Guards against 0. */
function dayStep(el: HTMLDivElement) {
  const kids = el.children;
  if (kids.length < 2) return el.clientWidth || 1;
  return (kids[1] as HTMLElement).offsetLeft - (kids[0] as HTMLElement).offsetLeft || 1;
}

export function WeekView({ date }: { date: string }) {
  const router = useRouter();
  const today = todayISO();
  const week = weekRange(date, 1);
  const thisWeek = week.includes(today);

  // Mobile day carousel: one day per screen, swipeable. `focusIdx` is the day
  // in the URL — we land on it (today for /week) and the dots/arrows under the
  // header step between days, rolling into the next/prev week at the ends.
  const scrollRef = useRef<HTMLDivElement>(null);
  const ticking = useRef(false);
  const focusIdx = Math.max(0, week.indexOf(date));
  const [active, setActive] = useState(focusIdx);

  // Snap the active day back to the URL's day when it changes (render-time
  // adjustment — no effect needed; swiping then updates it via onDaysScroll).
  const [syncedFocus, setSyncedFocus] = useState(focusIdx);
  if (syncedFocus !== focusIdx) {
    setSyncedFocus(focusIdx);
    setActive(focusIdx);
  }

  // Land the carousel on the focused day on mount / when it changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ left: focusIdx * dayStep(el), behavior: "auto" });
    });
    return () => cancelAnimationFrame(id);
  }, [focusIdx]);

  function scrollToDay(idx: number) {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: idx * dayStep(el), behavior: "smooth" });
  }
  function onDaysScroll() {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      ticking.current = false;
      const el = scrollRef.current;
      if (!el) return;
      setActive(Math.max(0, Math.min(week.length - 1, Math.round(el.scrollLeft / dayStep(el)))));
    });
  }
  // Step a day; at the week's edges roll into the adjacent week (lands on that day).
  function stepDay(delta: number) {
    const next = active + delta;
    if (next >= 0 && next < week.length) scrollToDay(next);
    else router.push(`/week/${addDays(week[active], delta)}`);
  }

  const results = useQueries({ queries: week.map((d) => tasksForDateQueryOptions(d)) });
  const subResults = useQueries({ queries: week.map((d) => subtasksForDateQueryOptions(d)) });
  const channelLookupQ = useChannelLookup();
  const profilesQ = useProfiles();
  const create = useCreateTask();
  const move = useMoveTaskToDate();

  // Chips resolve against all household categories (incl. a partner's shared task).
  const channelsById = channelLookupQ.data ?? EMPTY_CHANNEL_MAP;
  const profilesById = new Map((profilesQ.data ?? []).map((p) => [p.id, p]));

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  // Category filter lives in the sidebar (shared via context). Empty = "Todas".
  const { selected } = useChannelFilter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragStart(e: DragStartEvent) {
    setActiveTask((e.active.data.current?.task as Task) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    const task = e.active.data.current?.task as Task | undefined;
    const overId = e.over?.id;
    if (!task || typeof overId !== "string" || !overId.startsWith("day-")) return;
    const toDate = overId.slice(4);
    if (toDate === task.planned_date) return;
    const idx = week.indexOf(toDate);
    const targetTasks = (results[idx]?.data ?? []) as Task[];
    move.mutate({ task, toDate, sortOrder: orderForAppend(targetTasks.map((t) => t.sort_order)) });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">Semana</h1>
          <p className="text-sm text-muted">{weekRangeLabel(week)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => router.push(`/week/${addDays(week[0], -7)}`)}
            aria-label="Semana anterior"
            className={arrow}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            onClick={() => router.push(`/week/${today}`)}
            disabled={thisWeek}
            className={cn(
              "h-9 cursor-pointer rounded-lg px-2.5 text-sm font-medium transition-colors",
              thisWeek ? "cursor-default text-subtle" : "text-primary hover:bg-primary-soft",
            )}
          >
            Esta semana
          </button>
          <button
            onClick={() => router.push(`/week/${addDays(week[0], 7)}`)}
            aria-label="Semana siguiente"
            className={arrow}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      {/* Mobile day pager: shows which day you're on and steps between days. */}
      <div className="flex items-center justify-between gap-2 md:hidden">
        <button onClick={() => stepDay(-1)} aria-label="Día anterior" className={arrow}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex items-center gap-1.5">
          {week.map((d, i) => (
            <button
              key={d}
              onClick={() => scrollToDay(i)}
              aria-label={weekDayHeading(d, today)}
              aria-current={i === active ? "true" : undefined}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === active
                  ? "w-6 bg-primary"
                  : d === today
                    ? "w-1.5 bg-primary/40"
                    : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>
        <button onClick={() => stepDay(1)} aria-label="Día siguiente" className={arrow}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* Day columns now span the full width — the calendar and category filter
          moved into the sidebar. `min-w-0` keeps the day strip scrolling inside
          the pane instead of pushing the layout wider. */}
      <div className="min-w-0">
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveTask(null)}
        >
          {/* Mobile: one day per screen, swipeable (mandatory snap).
                lg: fixed 5-column grid (Mon–Fri), no horizontal scroll. */}
          <div
            ref={scrollRef}
            onScroll={onDaysScroll}
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-pl-4 px-4 pb-4 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] md:-mx-8 md:snap-proximity md:scroll-pl-8 md:px-8 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-x-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
          >
            {week.map((d, i) => {
              const all = (results[i].data ?? []) as Task[];
              return (
                <DayColumn
                  key={d}
                  date={d}
                  today={today}
                  weekend={i >= 5}
                  tasks={filterTasksByChannels(all, selected)}
                  subsMap={(subResults[i].data ?? NO_SUBTASKS) as Map<string, Subtask[]>}
                  channelsById={channelsById}
                  profilesById={profilesById}
                  dragging={!!activeTask}
                  onAdd={(title) =>
                    create.mutate({
                      title,
                      plannedDate: d,
                      channelId: null,
                      timeEstimateMin: null,
                      // Order against the full (unfiltered) day so a hidden
                      // filter never corrupts sort positions.
                      sortOrder: orderForAppend(all.map((t) => t.sort_order)),
                    })
                  }
                />
              );
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTask && (
              <div className="rounded-lg border border-primary bg-surface px-2.5 py-1.5 text-xs font-medium text-fg shadow-card">
                {activeTask.title}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

function DayColumn({
  date,
  today,
  weekend,
  tasks,
  subsMap,
  channelsById,
  profilesById,
  dragging,
  onAdd,
}: {
  date: string;
  today: string;
  weekend: boolean;
  tasks: Task[];
  subsMap: Map<string, Subtask[]>;
  channelsById: Map<string, Channel>;
  profilesById: Map<string, Profile>;
  dragging: boolean;
  onAdd: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${date}` });
  const isToday = date === today;
  const done = tasks.filter((t) => t.status === "done").length;
  const plannedMin = tasks.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0);

  return (
    <section
      className={cn(
        "flex w-full shrink-0 snap-start flex-col gap-2 md:w-[320px] lg:w-auto lg:min-w-0 lg:shrink",
        // Weekend columns only exist in the mobile swipe; the desktop grid is Mon–Fri.
        weekend && "lg:hidden",
      )}
    >
      <Link href={isToday ? "/today" : `/day/${date}`} className="group block">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "text-[15px] font-bold tracking-tight transition-colors group-hover:text-primary",
              isToday ? "text-primary" : "text-fg",
            )}
          >
            {weekDayHeading(date, today)}
          </span>
          {tasks.length > 0 && (
            <span className="shrink-0 text-[11px] font-medium text-subtle">
              {done}/{tasks.length}
              {plannedMin > 0 ? ` · ${formatMinutes(plannedMin)}` : ""}
            </span>
          )}
        </div>
      </Link>

      {/* Completion bar — fills as the day's tasks get checked off. */}
      <DayProgressBar done={done} total={tasks.length} />

      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-xl transition-colors",
          dragging && "outline-dashed outline-1 outline-transparent",
          isOver && "bg-primary-soft/50 outline-primary",
        )}
      >
        {tasks.map((t) => (
          <WeekCard
            key={t.id}
            task={t}
            channel={t.channel_id ? channelsById.get(t.channel_id) : undefined}
            owner={profilesById.get(t.owner_id)}
            subtasks={subsMap.get(t.id) ?? []}
          />
        ))}
      </div>

      <QuickAdd onAdd={onAdd} />
    </section>
  );
}

function WeekCard({
  task,
  channel,
  owner,
  subtasks,
}: {
  task: Task;
  channel?: Channel;
  owner?: Profile;
  subtasks: Subtask[];
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `wk-${task.id}`,
    data: { task },
  });
  return (
    <div ref={setNodeRef} className={cn("group/wk relative", isDragging && "opacity-40")}>
      <button
        {...attributes}
        {...listeners}
        aria-label="Mover a otro día"
        className="absolute top-1 left-1 z-10 cursor-grab touch-none rounded bg-surface/80 p-0.5 text-subtle opacity-0 transition-opacity hover:text-muted group-hover/wk:opacity-100 touch:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <TaskCard task={task} channel={channel} owner={owner} subtasks={subtasks} />
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");

  function submit() {
    const t = title.trim();
    if (!t) return;
    onAdd(t);
    setTitle("");
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 transition-colors focus-within:border-primary/60">
      <button
        onClick={submit}
        disabled={!title.trim()}
        aria-label="Agregar tarea a este día"
        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-subtle transition-colors hover:text-primary disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </button>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Agregar tarea…"
        aria-label="Nueva tarea"
        className="h-6 w-full bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
      />
    </div>
  );
}
