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
import { Check, ChevronDown, ChevronLeft, ChevronRight, GripVertical, Plus } from "lucide-react";
import {
  tasksForDateQueryOptions,
  useCreateTask,
  useMoveTaskToDate,
  useReorderTask,
} from "@/lib/queries/tasks";
import { subtasksForDateQueryOptions } from "@/lib/queries/subtasks";
import { useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { useShutdownDays } from "@/lib/queries/daily-notes";
import { resolveCapacity } from "@/lib/capacity";
import { useTaskDetail } from "@/lib/stores/task-detail";
import type { Channel, Profile, Subtask, Task } from "@/lib/queries/types";
import { addDays, todayISO, weekRange } from "@/lib/date";
import { orderForAppend } from "@/lib/ordering";
import {
  parsePriorityDropId,
  priorityRows,
  resolveTaskDrop,
  type PriorityDropTarget,
} from "@/lib/priority";
import { orderTasksForDisplay } from "@/lib/week-filter";
import { useChannelFilter } from "@/lib/channel-filter";
import { useCoarsePointer } from "@/lib/use-coarse-pointer";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskDragPreview } from "@/components/dnd/task-drag-preview";
import { SkeletonList } from "@/components/ui";
import { DROP_ANIMATION } from "@/lib/motion";
import { PriorityGroupHeader } from "@/components/tasks/priority-group-header";
import { ChannelFilterBar } from "@/components/tasks/channel-filter-bar";
import { createTaskCollision } from "@/components/dnd/collision";
import { CarryoverPrompt } from "@/components/day/carryover-prompt";
import { DayLoadBar } from "./day-progress-bar";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

const arrow =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

const NO_SUBTASKS = new Map<string, Subtask[]>();

/** Cards win over the thin priority strips; strips are only a fallback. */
const weekCollision = createTaskCollision({ fallback: closestCorners });

export function WeekView({ date }: { date: string }) {
  const labels = useDateLabels();
  const t = useTranslations("week");
  const router = useRouter();
  const today = todayISO();
  const week = weekRange(date, 1);
  const thisWeek = week.includes(today);

  const results = useQueries({ queries: week.map((d) => tasksForDateQueryOptions(d)) });
  const subResults = useQueries({ queries: week.map((d) => subtasksForDateQueryOptions(d)) });
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
  const [hideClosed, setHideClosed] = useState(false);
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
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">{t("title")}</h1>
          <p className="text-sm text-muted">{labels.weekRangeLabel(week)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {closedDays.size > 0 && (
            <button
              onClick={() => setHideClosed((v) => !v)}
              aria-pressed={hideClosed}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-xs font-semibold transition-colors md:px-3",
                hideClosed
                  ? "bg-primary-soft text-primary"
                  : "bg-surface-2 text-muted hover:text-fg",
              )}
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">
                {hideClosed ? t("showClosed") : t("hideClosed")}
              </span>
              {/* Whole phrases, not verb + noun glued in JSX: word order differs. */}
              <span className="sm:hidden">
                {hideClosed ? t("showClosedShort") : t("hideClosedShort")}
              </span>
            </button>
          )}
          <button
            onClick={() => router.push(`/week/${addDays(week[0], -7)}`)}
            aria-label={t("prevWeek")}
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
            {t("thisWeek")}
          </button>
          <button
            onClick={() => router.push(`/week/${addDays(week[0], 7)}`)}
            aria-label={t("nextWeek")}
            className={arrow}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      {/* Category filter at the top (mirrors the sidebar list, shared state). */}
      <ChannelFilterBar />

      {/* When you're looking at the current week, offer to pull yesterday's
          unfinished tasks into today right from here. */}
      {thisWeek && <CarryoverPrompt date={today} />}

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
          {/* Phone: days STACK VERTICALLY and you scroll down the week — the
                same direction as every other list in the app. It used to be a
                one-day-per-screen horizontal carousel, which hid the week, cost
                a swipe per day and fought the page's own scrolling.
              Tablet: horizontal strip of 320px columns.
              Desktop: fixed 5-column grid (Mon–Fri), no scrolling. */}
          <div className="flex flex-col gap-6 md:-mx-8 md:flex-row md:snap-x md:snap-proximity md:gap-3 md:overflow-x-auto md:overscroll-x-contain md:scroll-pl-8 md:px-8 md:pb-4 md:[-webkit-overflow-scrolling:touch] md:[scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-x-visible lg:px-0 lg:pb-0 md:[&::-webkit-scrollbar]:hidden">
            {week.map((d, i) => {
              const all = (results[i].data ?? []) as Task[];
              return (
                <DayColumn
                  key={d}
                  date={d}
                  today={today}
                  weekend={i >= 5}
                  loading={results[i].isLoading}
                  tasks={columns[i]}
                  subsMap={(subResults[i].data ?? NO_SUBTASKS) as Map<string, Subtask[]>}
                  channelsById={channelsById}
                  profilesById={profilesById}
                  dragging={!!activeTask}
                  capacityMin={capacityTarget}
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
 * One day of the week, as a card.
 *
 * The columns used to be bare stacks separated by whitespace, which made a busy
 * Thursday and an empty Friday look like the same object. Now each day is a
 * bordered card and today is the only lit one, so the week reads as five
 * containers with different amounts in them — which is the question you open
 * this screen to answer.
 *
 * A day you already closed collapses to one line: it's settled, and five
 * settled days shouldn't cost the same screen space as five open ones.
 */
function DayColumn({
  date,
  today,
  weekend,
  loading,
  tasks,
  subsMap,
  channelsById,
  profilesById,
  dragging,
  capacityMin,
  closed,
  hideClosed,
  onAdd,
}: {
  date: string;
  today: string;
  weekend: boolean;
  loading: boolean;
  tasks: Task[];
  subsMap: Map<string, Subtask[]>;
  channelsById: Map<string, Channel>;
  profilesById: Map<string, Profile>;
  dragging: boolean;
  capacityMin: number;
  closed: boolean;
  hideClosed: boolean;
  onAdd: (title: string) => void;
}) {
  const labels = useDateLabels();
  const t = useTranslations("week");
  const { setNodeRef, isOver } = useDroppable({ id: `day-${date}` });
  const isToday = date === today;
  const done = tasks.filter((task) => task.status === "done").length;
  const plannedMin = tasks.reduce((sum, task) => sum + (task.time_estimate_min ?? 0), 0);
  const measuredMin = tasks.reduce((sum, task) => sum + (task.actual_time_min ?? 0), 0);
  // A closed day only folds away when you asked for it — otherwise you'd lose
  // the drop target for "actually, move that to Tuesday".
  const folded = closed && hideClosed;

  const heading = (
    <Link
      href={isToday ? "/today" : `/day/${date}`}
      className="group sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 block bg-bg/95 py-1 backdrop-blur md:static md:bg-transparent md:py-0 md:backdrop-blur-none"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "text-base font-extrabold tracking-tight transition-colors group-hover:text-primary",
            isToday ? "text-primary" : "text-fg",
          )}
        >
          {labels.weekDayHeading(date, today)}
        </span>
        {tasks.length > 0 && (
          <span
            className={cn(
              "shrink-0 text-2xs font-bold tabular-nums",
              isToday ? "text-fg" : "text-subtle",
            )}
          >
            {done}/{tasks.length}
          </span>
        )}
      </div>
    </Link>
  );

  return (
    <section
      className={cn(
        // Phone: a full-width block in a vertical stack — no fixed width, no
        // snap. Tablet and up: a fixed-width column in the horizontal strip.
        "flex flex-col gap-2.5 rounded-2xl border p-3 md:w-[320px] md:shrink-0 md:snap-start lg:w-auto lg:min-w-0 lg:shrink",
        // Today is the only column that gets a surface — everything else is a
        // hairline on the page background.
        isToday ? "border-primary/45 bg-surface shadow-card" : "border-border",
        // Weekends exist on phone and tablet; the desktop grid is Mon–Fri.
        weekend && "lg:hidden",
      )}
    >
      {heading}

      {folded ? (
        <div
          ref={setNodeRef}
          className={cn(
            "flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-2 transition-colors",
            isOver && "bg-primary-soft",
          )}
        >
          <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-2xs font-semibold text-muted">
            {t("doneCount", { n: done })}
            {measuredMin > 0 && ` · ${formatMinutes(measuredMin)}`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 -rotate-90 text-subtle" aria-hidden />
        </div>
      ) : (
        <>
          {/* How full the day is, not how much of it you've ticked off. */}
          <DayLoadBar
            plannedMin={plannedMin}
            capacityMin={capacityMin}
            measuredMin={measuredMin}
            closed={closed}
          />

          {/* Add task at the top of each day. */}
          <QuickAdd onAdd={onAdd} />

          <div
            ref={setNodeRef}
            className={cn(
              "flex flex-1 flex-col gap-2 rounded-xl transition-colors",
              dragging && "outline-dashed outline-1 outline-transparent",
              isOver && "bg-primary-soft/50 outline-primary",
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
                    channel={
                      row.task.channel_id ? channelsById.get(row.task.channel_id) : undefined
                    }
                    owner={profilesById.get(row.task.owner_id)}
                    subtasks={subsMap.get(row.task.id) ?? []}
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
              // Cards and an empty state are mutually exclusive — showing both
              // (which the drop hint used to do) reads as a bug.
              tasks.length === 0 &&
              !dragging && <EmptyDay date={date} today={today} capacityMin={capacityMin} />
            )}
          </div>
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
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border-strong px-3 py-3.5 text-center">
      <p className="text-xs font-semibold text-muted">{t("freeDay")}</p>
      <p className="text-2xs leading-4 text-muted">
        {t("freeDayHint", {
          day: labels.compactDayLabel(date, today),
          capacity: formatMinutes(capacityMin),
        })}
      </p>
      <Link
        href="/backlog"
        className="self-center rounded-pill bg-primary/12 px-3 py-1 text-2xs font-bold text-primary transition-colors hover:bg-primary hover:text-on-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        {t("fromBacklog")}
      </Link>
    </div>
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
  const tt = useTranslations("tasks");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });
  const coarse = useCoarsePointer();
  const handle = { ...attributes, ...listeners };
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/wk relative",
        // Fully hidden, not faded: the DragOverlay now renders a real card
        // preview, so a visible source would read as two copies of the task.
        isDragging && "z-10 opacity-0",
        // Desktop: the whole card is the drag handle — a plain click still opens
        // the detail (the title is a button) thanks to the 6px activation
        // threshold. Touch: only the grip drags so the card body keeps scrolling.
        !coarse && "cursor-grab active:cursor-grabbing",
      )}
      {...(coarse ? {} : handle)}
    >
      {coarse && (
        <button
          {...handle}
          aria-label={tt("moveToDay")}
          className="absolute top-1 left-1 z-10 cursor-grab touch-none rounded bg-surface/80 p-0.5 text-subtle opacity-0 transition-opacity hover:text-muted group-hover/wk:opacity-100 touch:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      {/* Compact: the column is only ~320px, so the card drops its checklist,
          move menu and delete button — see lib/task-meta.ts. */}
      <TaskCard task={task} channel={channel} owner={owner} subtasks={subtasks} density="compact" />
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const t = useTranslations("week");
  const tt = useTranslations("tasks");
  const [title, setTitle] = useState("");

  function submit() {
    const value = title.trim();
    if (!value) return;
    onAdd(value);
    setTitle("");
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 transition-colors focus-within:border-primary/60">
      <button
        onClick={submit}
        disabled={!title.trim()}
        aria-label={t("addTaskToDay")}
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
        placeholder={t("addTaskPlaceholder")}
        aria-label={tt("newTask")}
        className="h-6 w-full bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
      />
    </div>
  );
}
