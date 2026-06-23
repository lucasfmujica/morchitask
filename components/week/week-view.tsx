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
import { useChannels } from "@/lib/queries/channels";
import { useProfiles } from "@/lib/queries/profiles";
import type { Channel, Profile, Subtask, Task } from "@/lib/queries/types";
import { addDays, todayISO, weekDayHeading, weekRange, weekRangeLabel } from "@/lib/date";
import { orderForAppend } from "@/lib/ordering";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TaskCard } from "@/components/tasks/task-card";

const arrow =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

const NO_SUBTASKS = new Map<string, Subtask[]>();

export function WeekView({ date }: { date: string }) {
  const router = useRouter();
  const today = todayISO();
  const week = weekRange(date, 1);
  const thisWeek = week.includes(today);

  // On phones the week is a horizontal swipe; land on "today" instead of Monday.
  const todayRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!thisWeek) return;
    const el = todayRef.current;
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ inline: "start", block: "nearest" }));
  }, [thisWeek, date]);

  const results = useQueries({ queries: week.map((d) => tasksForDateQueryOptions(d)) });
  const subResults = useQueries({ queries: week.map((d) => subtasksForDateQueryOptions(d)) });
  const channelsQ = useChannels();
  const profilesQ = useProfiles();
  const create = useCreateTask();
  const move = useMoveTaskToDate();

  const channelsById = new Map((channelsQ.data ?? []).map((c) => [c.id, c]));
  const profilesById = new Map((profilesQ.data ?? []).map((p) => [p.id, p]));

  const [activeTask, setActiveTask] = useState<Task | null>(null);
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
    <div className="flex flex-col gap-4 py-5">
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

      {/* Wide day columns, horizontally swipeable (Sunsama-style). */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveTask(null)}
      >
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto overscroll-x-contain scroll-pl-4 px-4 pb-4 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] md:-mx-8 md:scroll-pl-8 md:px-8 [&::-webkit-scrollbar]:hidden">
          {week.map((d, i) => (
            <DayColumn
              key={d}
              date={d}
              today={today}
              tasks={(results[i].data ?? []) as Task[]}
              subsMap={(subResults[i].data ?? NO_SUBTASKS) as Map<string, Subtask[]>}
              channelsById={channelsById}
              profilesById={profilesById}
              columnRef={d === today ? todayRef : undefined}
              dragging={!!activeTask}
              onAdd={(title, tasks) =>
                create.mutate({
                  title,
                  plannedDate: d,
                  channelId: null,
                  timeEstimateMin: null,
                  sortOrder: orderForAppend(tasks.map((t) => t.sort_order)),
                })
              }
            />
          ))}
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
  );
}

function DayColumn({
  date,
  today,
  tasks,
  subsMap,
  channelsById,
  profilesById,
  columnRef,
  dragging,
  onAdd,
}: {
  date: string;
  today: string;
  tasks: Task[];
  subsMap: Map<string, Subtask[]>;
  channelsById: Map<string, Channel>;
  profilesById: Map<string, Profile>;
  columnRef?: React.RefObject<HTMLElement | null>;
  dragging: boolean;
  onAdd: (title: string, tasks: Task[]) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${date}` });
  const isToday = date === today;
  const done = tasks.filter((t) => t.status === "done").length;
  const plannedMin = tasks.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0);

  return (
    <section
      ref={columnRef}
      className="flex w-[86vw] shrink-0 snap-start flex-col gap-2 sm:w-[320px]"
    >
      <Link href={isToday ? "/today" : `/day/${date}`} className="group mb-1 block">
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

      <QuickAdd onAdd={(title) => onAdd(title, tasks)} />
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
        className="absolute top-1 left-1 z-10 cursor-grab touch-none rounded bg-surface/80 p-0.5 text-subtle opacity-0 transition-opacity hover:text-muted group-hover/wk:opacity-100 active:cursor-grabbing"
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
