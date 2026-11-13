"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronLeft, ChevronRight, GripVertical, Plus } from "lucide-react";
import {
  tasksForDateQueryOptions,
  useCreateTask,
  useMoveTaskToDate,
  useReorderTask,
  useWorkedInRange,
} from "@/lib/queries/tasks";
import { useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { useShutdownDays } from "@/lib/queries/daily-notes";
import { resolveCapacity } from "@/lib/capacity";
import { canHaveWorked, resolveWorkGoal } from "@/lib/worked";
import { useTaskDetail } from "@/lib/stores/task-detail";
import type { Channel, Task } from "@/lib/queries/types";
import { addDays, todayISO, weekRange } from "@/lib/date";
import { orderForAppend } from "@/lib/ordering";
import {
  parsePriorityDropId,
  priorityRows,
  resolveTaskDrop,
  type PriorityDropTarget,
} from "@/lib/priority";
import { PriorityGroupHeader } from "@/components/tasks/priority-group-header";
import { orderTasksForDisplay } from "@/lib/week-filter";
import { useChannelFilter } from "@/lib/channel-filter";
import { useCoarsePointer } from "@/lib/use-coarse-pointer";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TaskDragPreview } from "@/components/dnd/task-drag-preview";
import { SkeletonList } from "@/components/ui";
import { DROP_ANIMATION } from "@/lib/motion";
import { createTaskCollision } from "@/components/dnd/collision";
import { CarryoverNotice } from "@/components/day/carryover-notice";
import { DayWorkedBar } from "./day-progress-bar";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

// Prev / this week / next share one pill track, like every segmented control.
const arrow =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-pill text-fg transition-colors hover:bg-surface";

/** Cards win over the thin priority strips; strips are only a fallback. */
const weekCollision = createTaskCollision({ fallback: closestCorners });

export function WeekView({ date }: { date: string }) {
  const labels = useDateLabels();
  const t = useTranslations("week");
  const tnav = useTranslations("nav");
  const router = useRouter();
  const today = todayISO();
  const week = weekRange(date, 1);
  const thisWeek = week.includes(today);

  const results = useQueries({ queries: week.map((d) => tasksForDateQueryOptions(d)) });
  const channelLookupQ = useChannelLookup();
  const profilesQ = useProfiles();
  const create = useCreateTask();
  const openDetail = useTaskDetail((s) => s.open);
  const move = useMoveTaskToDate();
  const reorder = useReorderTask();

  // Chips resolve against all household categories (incl. a partner's shared task).
  const channelsById = channelLookupQ.data ?? EMPTY_CHANNEL_MAP;
  const profilesById = new Map((profilesQ.data ?? []).map((p) => [p.id, p]));

  const me = useMe().data;
  const capacityTarget = resolveCapacity(null, me?.capacity_target_min);
  // One query for the whole week: which days you already closed.
  const closedDays = useShutdownDays(week[0], week[week.length - 1]);
  // And one for what I tracked on each day: the bars draw worked, not planned.
  const workedByDay = useWorkedInRange(week[0], week[week.length - 1]).data;
  const workGoal = resolveWorkGoal();
  // Closed days start folded: they are settled, and the canvas shows them as
  // one "N hechas" chip so the week ahead gets the room.
  const [hideClosed, setHideClosed] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  // Category filter — shared via context with the sidebar and the top filter
  // bar. Empty = "Todas".
  const { selected } = useChannelFilter();
  // The list shown in each column (category-filtered, completed sunk to the
  // bottom). Reused for rendering AND for computing drag positions.
  const columns = week.map((d, i) =>
    orderTasksForDisplay((results[i].data ?? []) as Task[], selected),
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // Monday-first, same as `week`, so index i names column i.
  const weekdays = labels.weekdayHeaders();

  function onDragStart(e: DragStartEvent) {
    setActiveTask((e.active.data.current?.task as Task) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) return;
    const task = active.data.current?.task as Task | undefined;
    if (!task) return;

    // Resolve the target day: dropping onto a card adopts that card's day, onto
    // a priority strip its own day, and onto a column's empty space the column
    // id (`day-<date>`).
    const overId = String(over.id);
    const overTask = over.data.current?.task as Task | undefined;
    const group = parsePriorityDropId(overId);
    const toDate = group
      ? group.scope
      : overId.startsWith("day-")
        ? overId.slice(4)
        : (overTask?.planned_date ?? null);
    if (!toDate) return;
    const toIdx = week.indexOf(toDate);
    if (toIdx === -1) return;
    const targetList = columns[toIdx] ?? [];

    // A bare column drop keeps the task's own priority; a card or strip drop
    // adopts the group it landed in.
    const target: PriorityDropTarget = group
      ? { kind: "group", priority: group.priority }
      : overTask
        ? { kind: "task", task: overTask }
        : { kind: "list" };
    const drop = resolveTaskDrop(targetList, task, target);
    if (!drop) return;

    if (toDate === task.planned_date) {
      reorder.mutate({ task, sortOrder: drop.sortOrder, priority: drop.priority });
    } else {
      move.mutate({ task, toDate, sortOrder: drop.sortOrder, priority: drop.priority });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header
        className="flex animate-up flex-wrap items-center gap-2.5 px-2 pt-3"
        style={{ animationDelay: "60ms" }}
      >
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
            {t("weekOf", { date: labels.dayMonthLabel(week[0]) })}
          </p>
          <h1 className="m-0 font-display text-[32px] font-semibold tracking-[-0.01em] text-fg">
            {t("title")}
          </h1>
        </div>
        <Link
          href="/review"
          className="hidden h-10 items-center rounded-pill px-4 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:inline-flex"
        >
          {tnav("review")}
        </Link>
        {closedDays.size > 0 && (
          <button
            onClick={() => setHideClosed((v) => !v)}
            aria-pressed={hideClosed}
            className="inline-flex h-10 cursor-pointer items-center rounded-pill bg-surface-2 px-4 text-sm font-semibold text-fg transition-colors hover:bg-border"
          >
            <span className="hidden sm:inline">
              {hideClosed ? t("showClosed") : t("hideClosed")}
            </span>
            {/* Whole phrases, not verb + noun glued in JSX: word order differs. */}
            <span className="sm:hidden">
              {hideClosed ? t("showClosedShort") : t("hideClosedShort")}
            </span>
          </button>
        )}
        <div className="flex items-center gap-0.5 rounded-pill bg-surface-2 p-1">
          <button
            onClick={() => router.push(`/week/${addDays(week[0], -7)}`)}
            aria-label={t("prevWeek")}
            className={arrow}
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          </button>
          <button
            onClick={() => router.push(`/week/${today}`)}
            disabled={thisWeek}
            className={cn(
              "h-9 cursor-pointer rounded-pill px-3.5 text-sm font-semibold transition-colors",
              // On the current week it reads as the selected segment; elsewhere
              // it's the way back.
              thisWeek
                ? "cursor-default bg-surface text-fg shadow-[0_1px_3px_rgb(var(--shadow-color)/0.12)]"
                : "text-fg hover:bg-surface",
            )}
          >
            {t("thisWeek")}
          </button>
          <button
            onClick={() => router.push(`/week/${addDays(week[0], 7)}`)}
            aria-label={t("nextWeek")}
            className={arrow}
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          </button>
        </div>
      </header>

      {/* On the current week, the sweep of earlier days' leftovers happens here
          too — whichever of Week and Day you open first does it, and the other
          finds it already done. */}
      {thisWeek && <CarryoverNotice date={today} />}

      {/* Day columns now span the full width — the calendar and category filter
          moved into the sidebar. `min-w-0` keeps the day strip scrolling inside
          the pane instead of pushing the layout wider. */}
      <div className="min-w-0">
        <DndContext
          sensors={sensors}
          collisionDetection={weekCollision}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveTask(null)}
        >
          {/* Phone: days STACK VERTICALLY and you scroll down the week, the
                same direction as every other list in the app. It used to be a
                one-day-per-screen horizontal carousel, which hid the week, cost
                a swipe per day and fought the page's own scrolling.
              Tablet and up: the canvas grid, seven columns of at least 176px
              that share the width and scroll sideways when it runs out. */}
          <div className="flex flex-col gap-3 md:grid md:grid-cols-[repeat(7,minmax(176px,1fr))] md:items-start md:gap-2.5 md:overflow-x-auto md:overscroll-x-contain md:pb-1">
            {week.map((d, i) => {
              const all = (results[i].data ?? []) as Task[];
              return (
                <DayColumn
                  key={d}
                  date={d}
                  today={today}
                  weekday={weekdays[i]}
                  index={i}
                  loading={results[i].isLoading}
                  tasks={columns[i]}
                  channelsById={channelsById}
                  dragging={!!activeTask}
                  capacityMin={capacityTarget}
                  workedMin={workedByDay?.get(d) ?? 0}
                  workGoalMin={workGoal}
                  closed={closedDays.has(d)}
                  hideClosed={hideClosed}
                  onAdd={(title) =>
                    create.mutate(
                      {
                        title,
                        plannedDate: d,
                        channelId: null,
                        timeEstimateMin: null,
                        // Order against the full (unfiltered) day so a hidden
                        // filter never corrupts sort positions.
                        sortOrder: orderForAppend(all.map((task) => task.sort_order)),
                      },
                      // Open the new task so you can flesh it out or complete it
                      // straight away, same as the Day list.
                      { onSuccess: (task) => openDetail(task) },
                    )
                  }
                />
              );
            })}
          </div>

          <DragOverlay dropAnimation={DROP_ANIMATION}>
            {activeTask && (
              <TaskDragPreview
                task={activeTask}
                channel={
                  activeTask.channel_id ? channelsById.get(activeTask.channel_id) : undefined
                }
                owner={profilesById.get(activeTask.owner_id)}
                density="compact"
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

/**
 * One day of the week, as a well.
 *
 * The columns used to be bare stacks separated by whitespace, which made a busy
 * Thursday and an empty Friday look like the same object. Now each day is a
 * grey well with its tasks as white cards inside, so the week reads as seven
 * containers with different amounts in them, which is the question you open
 * this screen to answer. Today's well carries a mint ring and its date sits in
 * the "fits" circle; a day you closed steps back a little.
 *
 * A day you already closed collapses to one "N hechas" tile under its load
 * bar: it's settled, and five settled days shouldn't cost the same screen
 * space as five open ones.
 */
function DayColumn({
  date,
  today,
  weekday,
  index,
  loading,
  tasks,
  channelsById,
  dragging,
  capacityMin,
  workedMin,
  workGoalMin,
  closed,
  hideClosed,
  onAdd,
}: {
  date: string;
  today: string;
  /** Abbreviated weekday name ("lun" / "Mon"), already in the reader's language. */
  weekday: string;
  /** Column position, for the staggered entrance. */
  index: number;
  loading: boolean;
  tasks: Task[];
  channelsById: Map<string, Channel>;
  dragging: boolean;
  capacityMin: number;
  workedMin: number;
  workGoalMin: number;
  closed: boolean;
  hideClosed: boolean;
  onAdd: (title: string) => void;
}) {
  const t = useTranslations("week");
  const labels = useDateLabels();
  const { setNodeRef, isOver } = useDroppable({ id: `day-${date}` });
  const isToday = date === today;
  const done = tasks.filter((task) => task.status === "done").length;
  const plannedMin = tasks.reduce((sum, task) => sum + (task.time_estimate_min ?? 0), 0);
  // A closed day only folds away when you asked for it, otherwise you'd lose
  // the drop target for "actually, move that to Tuesday".
  const folded = closed && hideClosed;
  const dayNum = Number(date.slice(8, 10));
  const hasDeadline = tasks.some((t) => t.due_date === date && t.status !== "done");

  return (
    <section
      aria-label={labels.fullDayLabel(date)}
      className={cn(
        "flex animate-up flex-col gap-1.5 rounded-[24px] bg-surface-2 p-2 md:min-w-0",
        // Today is the only lit well; a closed day is settled, so it recedes.
        isToday && "shadow-[inset_0_0_0_2px_var(--color-fit-from)]",
        closed && !isToday && "opacity-85",
      )}
      style={{ animationDelay: `${120 + index * 60}ms` }}
    >
      <div className="flex flex-col gap-2 px-2 pt-2 pb-1">
        {/* The date row opens the day. On a phone it sticks under the top bar
            while you scroll down that day's cards. */}
        <Link
          href={isToday ? "/today" : `/day/${date}`}
          className="group sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 flex items-center justify-between gap-2 rounded-pill bg-surface-2/95 backdrop-blur focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none md:static md:bg-transparent md:backdrop-blur-none"
        >
          <span className="truncate text-[11px] font-semibold tracking-[0.06em] text-muted uppercase transition-colors group-hover:text-fg">
            {weekday}
          </span>
          <span
            className={cn(
              "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pill font-display text-[17px] font-semibold tabular-nums transition-colors",
              isToday
                ? // White on the mint gradient, exactly as the canvas draws it.
                  "bg-fit text-on-primary shadow-[0_4px_12px_color-mix(in_srgb,var(--color-primary)_35%,transparent)]"
                : // A day with a deliverable gets the highlighter.
                  hasDeadline
                  ? "bg-marker text-on-marker"
                  : "text-fg group-hover:bg-surface",
            )}
          >
            {dayNum}
          </span>
        </Link>

        {/* How much of the day you worked; ahead of today, the plan in words. */}
        <DayWorkedBar
          workedMin={workedMin}
          goalMin={workGoalMin}
          plannedMin={plannedMin}
          capacityMin={capacityMin}
          future={!canHaveWorked(date, today)}
          closed={closed}
          index={index}
        />
      </div>

      {folded ? (
        <div
          ref={setNodeRef}
          className={cn(
            "flex items-center gap-2 rounded-[14px] bg-surface p-2.5 text-2xs font-semibold text-fg transition-colors",
            isOver && "bg-primary-soft",
          )}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-fit text-on-primary">
            <Check className="h-2.5 w-2.5" strokeWidth={4} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate">{t("doneCount", { n: done })}</span>
        </div>
      ) : (
        <>
          <div
            ref={setNodeRef}
            className={cn(
              "flex flex-1 flex-col gap-1.5 rounded-[14px] transition-colors",
              dragging && "outline-dashed outline-1 outline-transparent",
              isOver && "bg-primary-soft/60 outline-primary",
            )}
          >
            <SortableContext
              items={tasks.map((task) => task.id)}
              strategy={verticalListSortingStrategy}
            >
              {/* Columns are narrow, so separators stay compact and only appear
                  when the day actually mixes priorities (or while dragging, so
                  an empty group still has somewhere to drop). */}
              {priorityRows(tasks, { includeEmpty: dragging }).map((row) =>
                row.kind === "header" ? (
                  <PriorityGroupHeader
                    key={`prio-${row.priority ?? "none"}`}
                    scope={date}
                    priority={row.priority}
                    count={row.empty ? undefined : row.count}
                    empty={row.empty}
                    compact
                  />
                ) : (
                  <WeekCard
                    key={row.task.id}
                    task={row.task}
                    date={date}
                    today={today}
                    settled={closed}
                    channel={
                      row.task.channel_id ? channelsById.get(row.task.channel_id) : undefined
                    }
                  />
                ),
              )}
            </SortableContext>

            {/* A day that hasn't loaded is NOT an empty day. Without this branch
                every column announced "Sin tareas" until its query resolved, so
                opening the week looked like the whole week was blank. */}
            {loading ? (
              <SkeletonList count={2} rowClassName="h-16" />
            ) : (
              // Cards and an empty state are mutually exclusive: showing both
              // (which the drop hint used to do) reads as a bug.
              tasks.length === 0 &&
              !dragging && <EmptyDay date={date} today={today} capacityMin={capacityMin} />
            )}
          </div>
          {!closed && <QuickAdd onAdd={onAdd} />}
        </>
      )}
    </section>
  );
}

/**
 * A free day, with the two things you'd actually do about it. A bare "Sin
 * tareas" was true and useless; this one names the room the day has.
 */
function EmptyDay({
  date,
  today,
  capacityMin,
}: {
  date: string;
  today: string;
  capacityMin: number;
}) {
  const labels = useDateLabels();
  const t = useTranslations("week");
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] bg-surface/40 px-3 py-3.5 shadow-[inset_0_0_0_1.5px_var(--color-border-strong)]">
      <p className="font-sans text-sm font-semibold text-fg">{t("freeDay")}</p>
      <p className="text-2xs leading-[17px] text-muted">
        {t("freeDayHint", {
          day: labels.compactDayLabel(date, today),
          capacity: formatMinutes(capacityMin),
        })}
      </p>
      <Link
        href="/backlog"
        className="flex h-9 items-center justify-center rounded-pill bg-fg px-3 text-2xs font-semibold text-bg transition-colors hover:bg-fg/85 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        {t("fromBacklog")}
      </Link>
    </div>
  );
}

/**
 * The week's own card, drawn to the canvas: title, then one 11px line with the
 * category, the "Entrega" highlighter and the duration. No checkbox: a column
 * is ~176px, and a tick there competed with the title for the width the week
 * exists to show. Marking done lives one click away in the detail sheet the
 * card opens, and in Hoy, where the doing happens.
 */
function WeekCard({
  task,
  date,
  today,
  settled,
  channel,
}: {
  task: Task;
  /** The column's day, to tell "due here" from "due some other day". */
  date: string;
  today: string;
  /** The column's day is closed: everything on it reads as history. */
  settled: boolean;
  channel?: Channel;
}) {
  const t = useTranslations("week");
  const tt = useTranslations("tasks");
  const labels = useDateLabels();
  const openDetail = useTaskDetail((s) => s.open);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });
  const coarse = useCoarsePointer();
  const handle = { ...attributes, ...listeners };
  const done = task.status === "done";
  const struck = done || settled;
  // A finished task shows what it really took; an open one shows the estimate.
  const minutes = done && task.actual_time_min ? task.actual_time_min : task.time_estimate_min;
  const due = task.due_date && !done ? task.due_date : null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/wk relative flex flex-col gap-1.5 rounded-[14px] bg-surface p-2.5",
        "shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06)] transition-transform duration-200 hover:-translate-y-px",
        // Fully hidden, not faded: the DragOverlay renders a real card preview,
        // so a visible source would read as two copies of the task.
        isDragging && "z-10 opacity-0",
        // Desktop: the whole card is the drag handle; a plain click still opens
        // the detail thanks to the 6px activation threshold. Touch: only the
        // grip drags so the card body keeps scrolling.
        !coarse && "cursor-grab active:cursor-grabbing",
      )}
      {...(coarse ? {} : handle)}
    >
      {coarse && (
        <button
          {...handle}
          aria-label={tt("moveToDay")}
          className="absolute top-1 right-1 z-10 cursor-grab touch-none rounded-md bg-surface/80 p-0.5 text-subtle opacity-0 transition-opacity hover:text-muted group-hover/wk:opacity-100 touch:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}

      {/* The title is the card's button; its ::after stretches over the whole
          tile so a click anywhere opens the detail, keyboard included. */}
      <button
        onClick={() => openDetail(task)}
        className={cn(
          "line-clamp-3 cursor-pointer rounded text-left text-xs leading-[17px] font-semibold break-words",
          "after:absolute after:inset-0 after:rounded-[14px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus",
          struck ? "text-subtle line-through" : "text-fg",
        )}
      >
        {task.title}
      </button>

      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
        {channel && (
          <>
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
              style={{ background: channel.color }}
              aria-hidden
            />
            <span className="min-w-0 truncate">{channel.name}</span>
          </>
        )}
        {due && (
          <span
            title={t("dueOn", { day: labels.dueLabel(due, today) })}
            className={cn(
              "shrink-0 -rotate-[1.5deg] rounded-[4px] bg-marker px-[5px] font-mono text-on-marker uppercase",
              // Due on another day: the tag still says it, a step quieter.
              due !== date && "opacity-75",
            )}
          >
            {t("dueTag")}
          </span>
        )}
        {minutes ? (
          <span className="ml-auto shrink-0 font-mono">{formatMinutes(minutes)}</span>
        ) : null}
      </div>
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const t = useTranslations("week");
  const tt = useTranslations("tasks");
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState(false);

  function submit() {
    const value = title.trim();
    if (!value) return;
    onAdd(value);
    setTitle("");
  }

  // At the foot of the column, as the canvas has it: a quiet "+ Agregar tarea"
  // that becomes a field when you need it, so it never outshines the cards.
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex h-[38px] cursor-pointer items-center justify-center gap-1.5 rounded-pill text-2xs font-semibold text-muted transition-colors hover:bg-surface/70 hover:text-fg"
      >
        <Plus className="h-3 w-3" strokeWidth={2.4} aria-hidden />
        {tt("add")}
      </button>
    );
  }

  return (
    <div className="flex h-[38px] items-center gap-2 rounded-pill bg-surface px-3 shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06)]">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => !title.trim() && setEditing(false)}
        placeholder={t("addTaskPlaceholder")}
        aria-label={tt("newTask")}
        className="h-6 w-full bg-transparent text-xs text-fg placeholder:text-subtle outline-none"
      />
      <button
        onClick={submit}
        disabled={!title.trim()}
        aria-label={t("addTaskToDay")}
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-pill bg-primary text-on-primary transition-opacity disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
