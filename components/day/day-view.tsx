"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Inbox, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
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
  useMoveTaskToDate,
  useReorderTask,
  useTasksForDate,
  useWorkedInRange,
  taskKeys,
} from "@/lib/queries/tasks";
import { useBlocksForDate } from "@/lib/queries/task-blocks";
import { ensureDayMaterialized } from "@/lib/queries/routines";
import { useChannelFilter } from "@/lib/channel-filter";
import { orderTasksForDisplay } from "@/lib/week-filter";
import { parsePriorityDropId, resolveTaskDrop, type PriorityKey } from "@/lib/priority";
import type { Task, TaskBlock } from "@/lib/queries/types";
import { nextBlockDurationMin } from "@/lib/scheduling";
import { orderForAppend } from "@/lib/ordering";
import { resolveCapacity } from "@/lib/capacity";
import { useToast } from "@/lib/stores/toast";
import { carryOverdueNow } from "@/lib/actions/carryover";
import { carryoverKeys, useOverdueCount } from "@/lib/queries/carryover";
import { addDays, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { CarryoverNotice } from "./carryover-notice";
import { PastDayNotice } from "./past-day-notice";
import { TaskComposer, type ComposerSubmit } from "@/components/tasks/task-composer";
import { useComposerCreate } from "@/components/tasks/use-composer-create";
import { CaptureSheet } from "@/components/tasks/capture-sheet";
import { TaskListSection } from "@/components/tasks/task-list-section";
import { createTaskCollision } from "@/components/dnd/collision";
import { TaskDragPreview } from "@/components/dnd/task-drag-preview";
import { DROP_ANIMATION } from "@/lib/motion";
import { Confetti } from "@/components/ui/confetti";
import { AgendaView } from "./agenda-view";
import { CalendarEventsSection } from "./calendar-events-section";
import { Button } from "@/components/ui";
import { CapacityBar } from "./capacity-bar";
import {
  blockEndMin,
  blockStartMin,
  minutesToHHMM,
  useAgendaScheduling,
} from "./use-agenda-scheduling";
import { useDateLabels } from "@/lib/use-date-labels";
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
  const [replanOpen, setReplanOpen] = useState(false);
  // The sidebar's "Capturar" lands here with ?capture=1 and opens dictation.
  const searchParams = useSearchParams();
  const [dictating, setDictating] = useState(() => searchParams.get("capture") === "1");
  const labels = useDateLabels();
  const router = useRouter();
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
  const addFromComposer = useComposerCreate(date);
  const reorder = useReorderTask();
  const { selected } = useChannelFilter();
  const { scheduleNewBlock, moveBlock } = useAgendaScheduling(date);
  const move = useMoveTaskToDate();
  const toast = useToast();
  const backlogCount = useBacklogTasks().data?.length ?? 0;
  // Everything still unfinished on earlier days, so the empty state can offer
  // it by the count. Not just yesterday: on a Monday that is an empty Sunday.
  const overdueQ = useOverdueCount(date);
  const [carrying, setCarrying] = useState(false);

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
  // What I tracked on THIS day, from the per-day entries. Summing the tasks'
  // actual_time_min instead would credit today with a rolled-over task's hours
  // from yesterday, and miss time put into a task planned for another day.
  const workedMin = useWorkedInRange(date, date).data?.get(date) ?? 0;

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
    addFromComposer(input, tasks);
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
    const overTask = group ? undefined : ordered.find((t) => t.id === over.id);
    if (!group && !overTask) return;
    const drop = resolveTaskDrop(
      ordered,
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

  // The agenda's span, for its header: first block in, last block out.
  const allBlocks = [...blocksByTask.values()].flat();
  const agendaRange =
    allBlocks.length > 0
      ? {
          from: minutesToHHMM(Math.min(...allBlocks.map(blockStartMin))),
          to: minutesToHHMM(Math.max(...allBlocks.map(blockEndMin))),
        }
      : null;
  const isToday = date === todayISO();
  const goDay = (d: string) => router.push(d === todayISO() ? "/today" : `/day/${d}`);

  return (
    <div className="flex flex-col gap-4">
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}

      {/* The heading as the canvas has it: the weekday small, the date big,
          and the day's two verbs on the right. */}
      <header
        className="flex animate-up flex-wrap items-center gap-3 px-2 pt-3"
        style={{ animationDelay: "80ms" }}
      >
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          <span className="text-[11px] leading-4 font-semibold tracking-[0.06em] text-muted uppercase">
            {labels.weekdayName(date)}
          </span>
          <div className="flex items-center gap-1.5">
            <h1 className="truncate font-display text-[32px] leading-10 font-bold tracking-[-0.02em]">
              {labels.dayMonthLabel(date)}
            </h1>
            <button
              onClick={() => goDay(addDays(date, -1))}
              aria-label={t("prevDay")}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              onClick={() => goDay(addDays(date, 1))}
              aria-label={t("nextDay")}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            {!isToday && (
              <button
                onClick={() => goDay(todayISO())}
                className="h-8 cursor-pointer rounded-pill bg-surface-2 px-3 text-xs font-semibold text-fg transition-colors hover:bg-border"
              >
                {t("goToToday")}
              </button>
            )}
          </div>
        </div>
        <nav
          aria-label={t("viewSwitch")}
          className="hidden gap-0.5 rounded-pill bg-surface-2 p-1 sm:flex"
        >
          <span className="h-9 rounded-pill bg-surface px-4 text-sm leading-9 font-semibold text-fg shadow-pill">
            {t("viewDay")}
          </span>
          <Link
            href={`/week/${date}`}
            className="h-9 rounded-pill px-4 text-sm leading-9 font-semibold text-muted transition-colors hover:text-fg"
          >
            {tnav("week")}
          </Link>
          <Link
            href={`/month/${date}`}
            className="h-9 rounded-pill px-4 text-sm leading-9 font-semibold text-muted transition-colors hover:text-fg"
          >
            {tnav("month")}
          </Link>
        </nav>
        {isToday && (
          // Says what it does. "Se me rompió el día" was the feeling, not the
          // action, and nobody could tell what the button would do.
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setReplanOpen(true)}
            className="flex h-10 cursor-pointer items-center rounded-pill bg-surface-2 px-3.5 text-sm font-semibold text-fg transition-colors hover:bg-border sm:h-11 sm:px-4"
          >
            {t("replanButton")}
          </button>
        )}
        <Link
          href={`/shutdown/${date}`}
          className="flex h-10 items-center gap-2 rounded-pill bg-fg px-4 text-sm font-semibold text-surface shadow-cta transition-opacity hover:opacity-90 sm:h-11 sm:px-5"
        >
          {t("shutdownDay")}
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />
          </svg>
        </Link>
      </header>

      <PastDayNotice date={date} />
      {isToday && <CarryoverNotice date={date} />}

      {(myTasks.length > 0 || workedMin > 0) && (
        <CapacityBar
          className="animate-up [animation-delay:140ms]"
          tasks={myTasks}
          workedMin={workedMin}
          isToday={isToday}
          isFuture={date > todayISO()}
          plannedMin={myPlannedMin}
          targetMin={capacityTarget}
          onTargetChange={(capacity_min) => upsertNote.mutate({ capacity_min })}
          onMoveOverflow={handleMoveOverflow}
        />
      )}

      {/* Mobile: tabs switch Tareas/Agenda. Desktop: both side by side. */}
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
        {/* The canvas's two wells share the row by flex-basis (360 / 340),
            not as equal grid halves. */}
        <div className="lg:flex lg:items-start lg:gap-4">
          <section
            aria-label={t("tasksTitle")}
            className={cn(
              "min-w-0 animate-up flex-col gap-1.5 rounded-[28px] bg-surface-2 p-2 [animation-delay:200ms] lg:flex lg:flex-[1_1_360px]",
              mode === "list" ? "flex" : "hidden",
            )}
          >
            <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
              <h2 className="font-display text-lg font-semibold">{t("tasksTitle")}</h2>
              <span className="hidden text-2xs text-muted lg:inline">{t("dragHint")}</span>
            </div>
            {/* Adding sits at the top of the well, under its title: the list can
                be long, and the field you use most shouldn't scroll away. */}
            <TaskComposer
              channels={channelsQ.data ?? []}
              onSubmit={handleAdd}
              onDictate={() => setDictating(true)}
            />
            {/* On a phone the agenda is a tab away, so the day's events show here. */}
            <div className="lg:hidden">
              <CalendarEventsSection date={date} tasks={tasks} />
            </div>
            <TaskListSection
              bare
              tasks={ordered}
              isLoading={tasksQ.isLoading}
              channelsById={channelsById}
              profilesById={profilesById}
              subtasksByTaskId={subtasksByTaskId}
              onReorder={handleReorder}
              grouped
              scope={date}
              dragging={!!activeTask}
              // Three different "nothing here": a filter that matches nothing,
              // a day you finished, and a day you haven't filled.
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
                filtering ? undefined : allDone ? undefined : (
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
            <CaptureSheet
              viewDate={date}
              channels={channelsQ.data ?? []}
              viewTasks={tasks}
              open={dictating}
              onOpenChange={setDictating}
            />
          </section>

          <section
            aria-label={t("agendaTitle")}
            className={cn(
              "min-w-0 animate-up flex-col rounded-[28px] bg-surface-2 p-2 [animation-delay:260ms] lg:flex lg:flex-[1_1_340px]",
              mode === "agenda" ? "flex" : "hidden",
            )}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <h2 className="font-display text-lg font-semibold">{t("agendaTitle")}</h2>
              {agendaRange && (
                <span className="font-mono text-2xs text-muted">
                  {t("agendaRange", agendaRange)}
                </span>
              )}
            </div>
            <AgendaView
              date={date}
              tasks={tasks}
              blocksByTask={blocksByTask}
              channelsById={channelsById}
              activeTask={activeTask}
              activeBlockId={activeBlockId}
              replanOpen={replanOpen}
              onReplanOpenChange={setReplanOpen}
            />
          </section>
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
    <div className="flex w-fit gap-0.5 rounded-pill bg-surface-2 p-1">
      {(["list", "agenda"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={cn(
            "h-8 cursor-pointer rounded-pill px-4 text-sm font-semibold transition-colors",
            mode === m ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
          )}
        >
          {m === "list" ? t("tabList") : t("tabAgenda")}
        </button>
      ))}
    </div>
  );
}
