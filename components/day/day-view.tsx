"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Inbox, Moon, Sparkles, Sun } from "lucide-react";
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
import {
  useBacklogTasks,
  useCreateTask,
  useMoveTaskToDate,
  useReorderTask,
  useTasksForDate,
  taskKeys,
} from "@/lib/queries/tasks";
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
import { useToast } from "@/lib/stores/toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { carryOverdueNow } from "@/lib/actions/carryover";
import { carryoverKeys, useOverdueCount } from "@/lib/queries/carryover";
import { addDays, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { DateNavigator } from "@/components/layout/date-navigator";
import { ChannelFilterBar } from "@/components/tasks/channel-filter-bar";
import { CarryoverNotice } from "./carryover-notice";
import { PastDayNotice } from "./past-day-notice";
import { TaskComposer, type ComposerSubmit } from "@/components/tasks/task-composer";
import { TaskListSection } from "@/components/tasks/task-list-section";
import { createTaskCollision } from "@/components/dnd/collision";
import { TaskDragPreview } from "@/components/dnd/task-drag-preview";
import { DROP_ANIMATION } from "@/lib/motion";
import { Confetti } from "@/components/ui/confetti";
import { AgendaView } from "./agenda-view";
import { CalendarEventsSection } from "./calendar-events-section";
import { Button } from "@/components/ui";
import { CapacityBar } from "./capacity-bar";
import { DoneSection, UnscheduledSection } from "./day-sections";
import { useAgendaScheduling } from "./use-agenda-scheduling";
import { useTranslations } from "next-intl";

type Mode = "list" | "agenda";

// Prefer an agenda drop-slot when the pointer is over one, then a task card,
// then a priority group strip; otherwise fall back to closestCenter so the list
// keeps its smooth reorder behaviour.
const dayCollision = createTaskCollision({
  hardPrefixes: ["slot-"],
  fallback: closestCenter,
});

export function DayView({ date }: { date: string }) {
  const t = useTranslations("day");
  const tt = useTranslations("tasks");
  const tcm = useTranslations("common");
  const tnav = useTranslations("nav");
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
  const move = useMoveTaskToDate();
  const toast = useToast();
  const backlogCount = useBacklogTasks().data?.length ?? 0;
  // Everything still unfinished on earlier days, so the empty state can offer
  // it by the count. Not just yesterday: on a Monday that is an empty Sunday.
  const overdueQ = useOverdueCount(date);
  const [carrying, setCarrying] = useState(false);
  // The backlog section starts open where there's room for it.
  const wideScreen = useMediaQuery("(min-width: 1024px)");

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const blocksByTask = useMemo(
    () => blocksQ.data ?? new Map<string, TaskBlock[]>(),
    [blocksQ.data],
  );
  // The list (and its reorder) honours the sidebar category filter; the day's
  // stats, capacity and agenda stay computed from the full set.
  const filtering = selected.size > 0;
  // Filter by category → completed to the bottom → grouped by priority (display-only).
  const ordered = useMemo(() => orderTasksForDisplay(tasks, selected), [tasks, selected]);
  // What's finished leaves the list entirely and folds into its own section at
  // the foot — on a good day it was over half the screen.
  const visibleTasks = useMemo(() => ordered.filter((t) => t.status !== "done"), [ordered]);
  const doneTasks = useMemo(() => ordered.filter((t) => t.status === "done"), [ordered]);
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

  /**
   * Empty-day shortcut: pull in everything earlier days didn't finish.
   *
   * Deliberately skips the once-a-day claim the automatic sweep uses — this one
   * was asked for, so it should work even on a day already swept (for instance
   * after undoing it, or after something landed on a past date since).
   */
  async function bringOverdue() {
    setCarrying(true);
    try {
      await carryOverdueNow(date);
      qc.invalidateQueries({ queryKey: taskKeys.all });
      qc.invalidateQueries({ queryKey: carryoverKeys.overdue(date) });
    } finally {
      setCarrying(false);
    }
  }

  /** The capacity band's escape hatch: push the biggest loose task to tomorrow. */
  function handleMoveOverflow(task: Task) {
    const tomorrow = addDays(date, 1);
    move.mutate({ task, toDate: tomorrow, sortOrder: orderForAppend([]) });
    toast(t("movedToTomorrow", { title: task.title }), {
      label: tt("undo"),
      run: () =>
        move.mutate({
          task: { ...task, planned_date: tomorrow },
          toDate: date,
          sortOrder: task.sort_order,
        }),
    });
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

  const doneCount = tasks.filter((t) => t.status === "done").length;
  // Everything ticked off — a finished day, not an empty one.
  const allDone = doneTasks.length > 0 && visibleTasks.length === 0;
  const overduePending = overdueQ.data ?? 0;

  return (
    <div className="flex max-w-3xl flex-col gap-4 lg:max-w-5xl">
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}

      <DateNavigator
        date={date}
        meta={tasks.length > 0 ? `${doneCount} de ${tasks.length}` : undefined}
        actions={
          <>
            <Link
              href={`/plan/${date}`}
              aria-label={t("planDay")}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-accent-soft text-accent transition-colors hover:bg-accent hover:text-on-accent"
            >
              <Sun className="h-5 w-5" aria-hidden />
            </Link>
            {/* Desktop only: on a phone t("shutdown") is in the bottom nav, and the
                header is deliberately down to two actions. */}
            <Link
              href={`/shutdown/${date}`}
              aria-label={t("shutdownDay")}
              className="hidden h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg md:flex"
            >
              <Moon className="h-5 w-5" aria-hidden />
            </Link>
          </>
        }
      />

      <PastDayNotice date={date} />
      {date === todayISO() && <CarryoverNotice date={date} />}

      {/* Category filter at the top (mirrors the sidebar list, shared state). */}
      <ChannelFilterBar />

      {/* The capacity band bleeds to the page edges and stays put while you
          scroll — under the mobile top bar, at the top of the content area on
          desktop. It spans BOTH columns, because being over budget is a fact
          about the day, not about the list. */}
      {myTasks.length > 0 && (
        <CapacityBar
          tasks={myTasks}
          plannedMin={myPlannedMin}
          targetMin={capacityTarget}
          onTargetChange={(capacity_min) => upsertNote.mutate({ capacity_min })}
          onMoveOverflow={handleMoveOverflow}
          className="-mx-4 top-[calc(3.5rem+env(safe-area-inset-top))] md:-mx-8 md:top-0"
        />
      )}

      <TaskComposer channels={channelsQ.data ?? []} onSubmit={handleAdd} />

      {/* Mobile: tabs switch Lista/Agenda. Desktop: both side by side — so the
          tabs go away and only the score stays. */}
      <div className="flex items-center justify-between gap-3">
        <div className="lg:hidden">
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        {tasks.length > 0 && (
          <span className="ml-auto text-xs font-semibold text-muted">
            {t("doneOfTotal", { done: doneCount, total: tasks.length })}
          </span>
        )}
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
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-7">
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
              // Three different "nothing here": a filter that matches nothing,
              // a day you finished, and a day you haven't filled. They used to
              // be one message — and now that finished tasks leave the list, a
              // fully-done day would have read t("emptyDay") with
              // "traé más trabajo" buttons right above its own 13 hechas.
              emptyTitle={filtering ? t("emptyCategory") : allDone ? t("allDone") : t("emptyDay")}
              emptyHint={
                filtering
                  ? t("noTasksInCategory")
                  : allDone
                    ? t("doneCount", { n: doneCount })
                    : emptyHint(overduePending, backlogCount, t, tcm("listJoin"))
              }
              emptyIcon={allDone && !filtering ? Check : Sparkles}
              emptyAction={
                filtering ? undefined : allDone ? (
                  <Link href={`/shutdown/${date}`}>
                    <Button size="sm">{t("shutdownDay")}</Button>
                  </Link>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {!!overduePending && (
                      <Button size="sm" onClick={bringOverdue} disabled={carrying}>
                        {t("bringOverdue", { n: overduePending })}
                      </Button>
                    )}
                    {backlogCount > 0 && (
                      <Link href="/backlog">
                        <Button variant="secondary" size="sm">
                          <Inbox className="h-4 w-4" aria-hidden />
                          {t("openBacklog", { n: backlogCount })}
                        </Button>
                      </Link>
                    )}
                    <Link href={`/plan/${date}`}>
                      <Button variant="ghost" size="sm">
                        {tnav("plan")}
                      </Button>
                    </Link>
                  </div>
                )
              }
              hosted
            />

            {/* The foot of the day: what's finished, and what's still homeless. */}
            <DoneSection tasks={doneTasks} channelsById={channelsById} defaultOpen={allDone} />
            <UnscheduledSection date={date} channelsById={channelsById} defaultOpen={wideScreen} />
          </div>
          <div className={cn("lg:block", mode === "agenda" ? "block" : "hidden")}>
            <p className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-subtle lg:block">
              {t("agendaHint")}
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

/** The empty day, with the two places work can come from, counted. */
/** Takes the translator rather than calling the hook: this is a plain helper,
 *  and hooks may only run inside components. */
function emptyHint(
  overduePending: number,
  backlogCount: number,
  t: ReturnType<typeof useTranslations<"day">>,
  join: string,
): string {
  const parts: string[] = [];
  if (overduePending) parts.push(t("hintOverdue", { n: overduePending }));
  if (backlogCount) parts.push(t("hintBacklog", { n: backlogCount }));
  if (parts.length === 0) return t("planHint");
  // The connector is language too: " y " / " and ".
  return t("hintTail", { parts: parts.join(join) });
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const t = useTranslations("day");
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
          {m === "list" ? t("tabList") : t("tabAgenda")}
        </button>
      ))}
    </div>
  );
}
