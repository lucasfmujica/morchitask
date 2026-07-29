"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Moon, Sparkles, Sun } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useChannels, useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import { useDailyNote, useUpsertDailyNote } from "@/lib/queries/daily-notes";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { useSubtasksForDate } from "@/lib/queries/subtasks";
import { useCreateTask, useReorderTask, useTasksForDate, taskKeys } from "@/lib/queries/tasks";
import { useBlocksForDate } from "@/lib/queries/task-blocks";
import { ensureDayMaterialized } from "@/lib/queries/routines";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { useChannelFilter } from "@/lib/channel-filter";
import { orderTasksForDisplay } from "@/lib/week-filter";
import { parsePriorityDropId, resolveTaskDrop, type PriorityKey } from "@/lib/priority";
import type { Task, TaskBlock } from "@/lib/queries/types";
import { nextBlockDurationMin } from "@/lib/scheduling";
import { orderForAppend } from "@/lib/ordering";
import { resolveCapacity } from "@/lib/capacity";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { DateNavigator } from "@/components/layout/date-navigator";
import { ChannelFilterBar } from "@/components/tasks/channel-filter-bar";
import { CarryoverPrompt } from "./carryover-prompt";
import { TaskComposer, type ComposerSubmit } from "@/components/tasks/task-composer";
import { TaskListSection } from "@/components/tasks/task-list-section";
import { createTaskCollision } from "@/components/dnd/collision";
import { TaskDragPreview } from "@/components/dnd/task-drag-preview";
import { DROP_ANIMATION } from "@/lib/motion";
import { Confetti } from "@/components/ui/confetti";
import { AgendaView } from "./agenda-view";
import { CalendarEventsSection } from "./calendar-events-section";
import { CapacityBar } from "./capacity-bar";
import { DaySummary } from "./day-summary";
import { useAgendaScheduling } from "./use-agenda-scheduling";

type Mode = "list" | "agenda";

// Prefer an agenda drop-slot when the pointer is over one, then a task card,
// then a priority group strip; otherwise fall back to closestCenter so the list
// keeps its smooth reorder behaviour.
const dayCollision = createTaskCollision({
  hardPrefixes: ["slot-"],
  fallback: closestCenter,
});

export function DayView({ date }: { date: string }) {
  const [mode, setMode] = useState<Mode>("list");
  const qc = useQueryClient();

  // Generate this day's recurring routine instances on open (idempotent).
  useEffect(() => {
    ensureDayMaterialized(date)
      .then(() => qc.invalidateQueries({ queryKey: taskKeys.date(date) }))
      .catch(() => {});
  }, [date, qc]);

  const tasksQ = useTasksForDate(date);
  const blocksQ = useBlocksForDate(date);
  const channelsQ = useChannels();
  const channelLookupQ = useChannelLookup();
  const profilesQ = useProfiles();
  const subtasksQ = useSubtasksForDate(date);
  const noteQ = useDailyNote(date);
  const upsertNote = useUpsertDailyNote(date);
  const me = useMe().data;
  const create = useCreateTask();
  const reorder = useReorderTask();
  const openDetail = useTaskDetail((s) => s.open);
  const { selected } = useChannelFilter();
  const { scheduleNewBlock, moveBlock } = useAgendaScheduling(date);

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const blocksByTask = useMemo(
    () => blocksQ.data ?? new Map<string, TaskBlock[]>(),
    [blocksQ.data],
  );
  // The list (and its reorder) honours the sidebar category filter; the day's
  // stats, capacity and agenda stay computed from the full set.
  const filtering = selected.size > 0;
  // Filter by category → completed to the bottom → grouped by priority (display-only).
  const visibleTasks = useMemo(() => orderTasksForDisplay(tasks, selected), [tasks, selected]);
  const myTasks = useMemo(() => tasks.filter((t) => t.owner_id === me?.id), [tasks, me?.id]);
  const myPlannedMin = useMemo(
    () => myTasks.reduce((sum, t) => sum + (t.time_estimate_min ?? 0), 0),
    [myTasks],
  );
  const capacityTarget = resolveCapacity(noteQ.data?.capacity_min, me?.capacity_target_min);

  // Celebrate the moment you finish everything for the day (once per completion).
  const allMineDone = myTasks.length > 0 && myTasks.every((t) => t.status === "done");
  const [celebrate, setCelebrate] = useState(false);
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (allMineDone && !celebratedRef.current) {
      celebratedRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCelebrate(true);
    } else if (!allMineDone) {
      celebratedRef.current = false;
    }
  }, [allMineDone]);
  // Display chips resolve against ALL household categories (so a partner's shared
  // task shows its category); the composer below uses only my own categories.
  const channelsById = channelLookupQ.data ?? EMPTY_CHANNEL_MAP;
  const profilesById = useMemo(
    () => new Map((profilesQ.data ?? []).map((p) => [p.id, p])),
    [profilesQ.data],
  );
  const subtasksByTaskId = useMemo(() => subtasksQ.data ?? new Map(), [subtasksQ.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  // Where the drag started decides WHICH preview to show. Agenda draggables
  // (ids like `task-…`/`block-…`) can be ~28px tall, so a card preview would be
  // crushed — they get a pill. List rows get a real card preview, and the
  // source row goes invisible (see SortableRow) so there's no double image.
  const [dragSource, setDragSource] = useState<"list" | "agenda">("list");

  function resolveTask(id: string, data?: Record<string, unknown>): Task | null {
    return (data?.task as Task) ?? tasks.find((t) => t.id === id) ?? null;
  }

  function handleAdd(input: ComposerSubmit) {
    create.mutate(
      {
        title: input.title,
        plannedDate: date,
        channelId: input.channelId,
        timeEstimateMin: input.timeEstimateMin,
        priority: input.priority,
        sortOrder: orderForAppend(tasks.map((t) => t.sort_order)),
      },
      // Open the new task's detail right away so you can add notes, subtasks,
      // an estimate, or complete it without hunting for the card and clicking.
      { onSuccess: (task) => openDetail(task) },
    );
  }

  function handleReorder(task: Task, sortOrder: number, priority?: PriorityKey) {
    reorder.mutate({ task, sortOrder, priority });
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const data = e.active.data.current as { task?: Task; block?: TaskBlock } | undefined;
    setActiveTask(resolveTask(id, data));
    setActiveBlockId(data?.block?.id ?? null);
    const fromAgenda = id.startsWith("task-") || id.startsWith("block-");
    setDragSource(fromAgenda ? "agenda" : "list");
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    setActiveBlockId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    const data = active.data.current as { task?: Task; block?: TaskBlock } | undefined;
    const task = resolveTask(String(active.id), data);
    if (!task) return;

    // Dropped on a calendar slot → move that block, or create a new one.
    if (overId.startsWith("slot-")) {
      const slotMin = Number(overId.slice(5));
      if (data?.block) {
        moveBlock(data.block, slotMin);
      } else {
        const dur = nextBlockDurationMin(task.time_estimate_min, blocksByTask.get(task.id) ?? []);
        scheduleNewBlock(task, slotMin, dur);
      }
      return;
    }

    // Otherwise it's a drop inside the grouped (possibly filtered) visible list.
    // Landing on a card of another priority — or on a group strip — adopts that
    // group, so one drag both reorders and re-prioritizes.
    const group = parsePriorityDropId(overId);
    const overTask = group ? undefined : visibleTasks.find((t) => t.id === over.id);
    if (!group && !overTask) return;
    const drop = resolveTaskDrop(
      visibleTasks,
      task,
      group ? { kind: "group", priority: group.priority } : { kind: "task", task: overTask! },
    );
    if (!drop) return;
    handleReorder(task, drop.sortOrder, drop.priority);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4 lg:max-w-5xl">
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <DateNavigator date={date} />
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-0.5">
          <Link
            href={`/plan/${date}`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Sun className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Planificar</span>
          </Link>
          <Link
            href={`/shutdown/${date}`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Moon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Cerrar día</span>
          </Link>
        </div>
      </div>
      {date === todayISO() && <CarryoverPrompt date={date} />}

      {/* Category filter at the top (mirrors the sidebar list, shared state). */}
      <ChannelFilterBar />

      <div className="flex flex-col gap-3">
        <DaySummary tasks={tasks} />
        {myTasks.length > 0 && (
          <CapacityBar
            plannedMin={myPlannedMin}
            targetMin={capacityTarget}
            onTargetChange={(capacity_min) => upsertNote.mutate({ capacity_min })}
          />
        )}
      </div>
      <TaskComposer channels={channelsQ.data ?? []} onSubmit={handleAdd} />

      {/* Mobile: tabs switch Lista/Agenda. Desktop: both side by side. */}
      <div className="lg:hidden">
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={dayCollision}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveTask(null);
          setActiveBlockId(null);
        }}
      >
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
          <div className={cn("space-y-3 lg:block", mode === "list" ? "block" : "hidden")}>
            <CalendarEventsSection date={date} tasks={tasks} />
            <TaskListSection
              tasks={visibleTasks}
              isLoading={tasksQ.isLoading}
              channelsById={channelsById}
              profilesById={profilesById}
              subtasksByTaskId={subtasksByTaskId}
              onReorder={handleReorder}
              grouped
              scope={date}
              dragging={!!activeTask}
              emptyTitle={filtering ? "Nada en esta categoría" : "Tu día está en blanco"}
              emptyHint={
                filtering
                  ? "No hay tareas de las categorías elegidas para hoy."
                  : "Elegí unas pocas cosas para hoy y planificá con calma."
              }
              emptyIcon={Sparkles}
              hosted
            />
          </div>
          <div className={cn("lg:block", mode === "agenda" ? "block" : "hidden")}>
            <p className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-subtle lg:block">
              Agenda · arrastrá una tarea a una hora
            </p>
            <AgendaView
              date={date}
              tasks={tasks}
              blocksByTask={blocksByTask}
              channelsById={channelsById}
              activeTask={activeTask}
              activeBlockId={activeBlockId}
            />
          </div>
        </div>

        <DragOverlay dropAnimation={DROP_ANIMATION}>
          {activeTask && (
            <TaskDragPreview
              task={activeTask}
              channel={activeTask.channel_id ? channelsById.get(activeTask.channel_id) : undefined}
              owner={profilesById.get(activeTask.owner_id)}
              variant={dragSource === "agenda" ? "pill" : "card"}
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex w-fit gap-1 rounded-pill border border-border bg-surface-2 p-0.5">
      {(["list", "agenda"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={cn(
            "cursor-pointer rounded-pill px-3 py-1 text-sm font-medium transition-colors",
            mode === m ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
          )}
        >
          {m === "list" ? "Lista" : "Agenda"}
        </button>
      ))}
    </div>
  );
}
