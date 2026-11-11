"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { useChannels, useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import { taskKeys, useBacklogTasks, useMoveTaskToDate, useUpdateTask } from "@/lib/queries/tasks";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { useToast } from "@/lib/stores/toast";
import { useChannelFilter } from "@/lib/channel-filter";
import { filterTasksByChannels } from "@/lib/week-filter";
import type { Channel, Task } from "@/lib/queries/types";
import { addDays, ageInDays, todayISO } from "@/lib/date";
import { formatMinutes, TIME_ESTIMATES } from "@/lib/format";
import { orderForAppend } from "@/lib/ordering";
import { cn } from "@/lib/utils";
import { TaskComposer, type ComposerSubmit } from "@/components/tasks/task-composer";
import { useComposerCreate } from "@/components/tasks/use-composer-create";
import { CaptureSheet } from "@/components/tasks/capture-sheet";
import { EmptyState, SkeletonList, Well } from "@/components/ui";
import { PRIORITY_GROUPS, priorityLabelKey, priorityOf } from "@/lib/priority";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

/** Past this, an idea isn't waiting for a slot: it's waiting for a decision. */
const STALE_DAYS = 30;

/** Group dots as the canvas has them. Not PRIORITY_DOT: here the four groups
 *  sit side by side as wells, and "Baja" in green read as "this one fits". */
const GROUP_DOT: Record<string, string> = {
  high: "bg-accent",
  medium: "bg-marker",
  low: "bg-subtle",
  none: "bg-border-strong",
};

/**
 * The backlog: everything without a day.
 *
 * Every row carries its AGE, because how long an idea has been sitting there is
 * the fact that decides its fate and a list of bare titles hides it. Scheduling
 * is a button on the row rather than a trip through the task sheet. The list is
 * split by priority into wells, so "what matters" reads before "what's oldest".
 */
export function BacklogView() {
  const t = useTranslations("backlog");
  const tt = useTranslations("tasks");
  const tasksQ = useBacklogTasks();
  const channelsQ = useChannels();
  const channelLookupQ = useChannelLookup();
  const addFromComposer = useComposerCreate(null);
  const { selected } = useChannelFilter();
  const today = todayISO();

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const filtering = selected.size > 0;
  const visibleTasks = useMemo(() => filterTasksByChannels(tasks, selected), [tasks, selected]);
  const groups = useMemo(
    () =>
      PRIORITY_GROUPS.map((priority) => ({
        priority,
        tasks: visibleTasks.filter((task) => priorityOf(task) === priority),
      })).filter((g) => g.tasks.length > 0),
    [visibleTasks],
  );
  const channelsById = channelLookupQ.data ?? EMPTY_CHANNEL_MAP;

  const estimatedMin = tasks.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0);
  const unestimated = tasks.filter((t) => t.time_estimate_min == null);
  const stale = tasks.filter((t) => ageInDays(t.created_at, today) > STALE_DAYS);
  const [estimating, setEstimating] = useState(false);

  useOpenSharedTask();

  function handleAdd(input: ComposerSubmit) {
    addFromComposer(input, tasks);
  }

  const big = (chunks: ReactNode) => (
    <span className="font-display text-[28px] leading-8 font-bold tabular-nums text-fg">
      {chunks}
    </span>
  );

  return (
    <div className="flex max-w-[1000px] flex-col gap-4">
      <header className="flex flex-col gap-0.5 px-2 pt-3">
        <h1 className="font-display text-[32px] leading-9 font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-muted">{t("subtitle")}</p>
      </header>

      {/* Real numbers, not "N tareas": what's here, how long it'd take, and how
          much of it you can't even weigh yet. Hidden on an empty backlog, where
          three zeros say less than the empty state does. */}
      {tasks.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
          <div className="flex flex-col gap-0.5 rounded-2xl bg-surface-2 px-[18px] py-4 text-xs text-muted">
            {t.rich("statUndated", { n: tasks.length, big })}
          </div>
          <div className="flex flex-col gap-0.5 rounded-2xl bg-surface-2 px-[18px] py-4 text-xs text-muted">
            {t.rich("statEstimated", { time: formatMinutes(estimatedMin), big })}
          </div>
          <div className="col-span-2 flex items-center gap-2.5 rounded-2xl bg-surface-2 py-3 pr-3 pl-[18px] sm:col-span-1">
            <div className="flex flex-1 flex-col gap-0.5 text-xs text-muted">
              {t.rich("statUnestimated", { n: unestimated.length, big })}
            </div>
            {(unestimated.length > 0 || estimating) && (
              <button
                onClick={() => setEstimating((v) => !v)}
                aria-pressed={estimating}
                className="h-[38px] shrink-0 cursor-pointer rounded-pill bg-surface px-3.5 text-xs font-semibold text-fg transition-colors hover:bg-bg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
              >
                {estimating ? t("doneEstimating") : t("estimateThem", { n: unestimated.length })}
              </button>
            )}
          </div>
        </div>
      )}

      {/* The honest question nobody asks themselves unprompted. It sits above
          the list now: below it, a long backlog pushed it off every screen. */}
      {stale.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-marker/25 px-[18px] py-3.5">
          <span className="-rotate-2 rounded-[4px] bg-marker px-1.5 py-0.5 font-mono text-[11px] text-on-marker uppercase">
            {t("staleChip", { days: STALE_DAYS })}
          </span>
          <p className="min-w-0 flex-[1_1_260px] text-[13px] text-fg">
            {t.rich("staleNotice", {
              n: stale.length,
              b: (chunks) => <b className="font-semibold">{chunks}</b>,
            })}
          </p>
        </section>
      )}

      <TaskComposer channels={channelsQ.data ?? []} onSubmit={handleAdd} />
      <CaptureSheet viewDate={null} channels={channelsQ.data ?? []} viewTasks={tasks} />

      <CategoryPills />

      {tasksQ.isLoading ? (
        <Well>
          <SkeletonList />
        </Well>
      ) : visibleTasks.length === 0 ? (
        <Well>
          <EmptyState
            icon={Inbox}
            title={filtering ? t("emptyCategory") : t("emptyTitle")}
            hint={filtering ? t("emptyCategoryHint") : t("emptyHint")}
            kbd="N"
            kbdHint={tt("kbdNewTask")}
            className="border-transparent bg-surface/60"
          />
        </Well>
      ) : (
        groups.map(({ priority, tasks: inGroup }) => {
          const label = tt(priorityLabelKey(priority));
          return (
            <section
              key={priority ?? "none"}
              aria-label={label}
              className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 p-2"
            >
              <div className="flex items-center gap-2 px-2.5 pt-2 pb-1">
                <span
                  className={cn("h-2 w-2 rounded-full", GROUP_DOT[priority ?? "none"])}
                  aria-hidden
                />
                <h2 className="font-display text-sm font-semibold text-fg">{label}</h2>
                <span className="font-mono text-[11px] text-muted tabular-nums">
                  {inGroup.length}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {inGroup.map((task) => (
                  <BacklogRow
                    key={task.id}
                    task={task}
                    channel={task.channel_id ? channelsById.get(task.channel_id) : undefined}
                    today={today}
                    estimating={estimating}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

/**
 * The category pills above the list. Same shared filter as the sidebar (so the
 * two stay in sync), drawn the way the canvas has it: the chosen one in ink.
 * Not ChannelFilterBar, whose green chips read as status next to the wells.
 */
function CategoryPills() {
  const t = useTranslations("backlog");
  const tt = useTranslations("tasks");
  const channels = useChannels().data ?? [];
  const { selected, toggle, clear } = useChannelFilter();
  if (channels.length === 0) return null;

  const pill = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-pill px-4 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
      active ? "bg-fg text-bg" : "bg-surface-2 text-fg hover:bg-border",
    );

  return (
    <div
      role="group"
      aria-label={t("categoryFilter")}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        onClick={clear}
        aria-pressed={selected.size === 0}
        className={pill(selected.size === 0)}
      >
        <span className="h-[7px] w-[7px] rounded-[2px] bg-current" aria-hidden />
        {tt("allCategories")}
      </button>
      {channels.map((c) => (
        <button
          key={c.id}
          onClick={() => toggle(c.id)}
          aria-pressed={selected.has(c.id)}
          className={pill(selected.has(c.id))}
        >
          <span
            className="h-[7px] w-[7px] rounded-[2px]"
            style={{ backgroundColor: c.color }}
            aria-hidden
          />
          {c.name}
        </button>
      ))}
    </div>
  );
}

/**
 * After "Compartir → Morchitask" the /share route redirects here with
 * `?shared=<taskId>`: open that task and confirm it landed. The backlog may be
 * showing a cached copy from before the share, so it's refetched first and the
 * task is looked up in the fresh data.
 */
function useOpenSharedTask() {
  const queryClient = useQueryClient();
  const openDetail = useTaskDetail((s) => s.open);
  const toast = useToast();
  const t = useTranslations("backlog");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("shared");
    if (!id) return;
    // Drop the param so a reload doesn't reopen the task and repeat the toast.
    window.history.replaceState(null, "", window.location.pathname);
    if (id === "error") {
      toast(t("sharedFailed"));
      return;
    }
    // No cancel-on-unmount: the param is already gone, so a dev-mode double
    // effect would otherwise drop the share; detail and toast are global stores.
    queryClient
      .refetchQueries({ queryKey: taskKeys.backlog })
      .catch(() => {})
      .then(() => {
        const task = queryClient
          .getQueryData<Task[]>(taskKeys.backlog)
          ?.find((candidate) => candidate.id === id);
        if (task) openDetail(task);
        toast(t("sharedSaved"));
      });
  }, [queryClient, openDetail, toast, t]);
}

function BacklogRow({
  task,
  channel,
  today,
  estimating,
}: {
  task: Task;
  channel?: Channel;
  today: string;
  estimating: boolean;
}) {
  const t = useTranslations("backlog");
  const tt = useTranslations("tasks");
  const tcm = useTranslations("common");
  const td = useTranslations("day");
  const labels = useDateLabels();
  const move = useMoveTaskToDate();
  const update = useUpdateTask();
  const openDetail = useTaskDetail((s) => s.open);
  const toast = useToast();

  function schedule(toDate: string, when: string) {
    move.mutate({ task, toDate, sortOrder: orderForAppend([]) });
    toast(t("movedTo", { title: task.title, when }), {
      label: tt("undo"),
      run: () =>
        move.mutate({
          task: { ...task, planned_date: toDate },
          toDate: null,
          sortOrder: task.sort_order,
        }),
    });
  }

  function cycleEstimate() {
    const cur = task.time_estimate_min;
    const idx = cur ? TIME_ESTIMATES.indexOf(cur) : -1;
    const next =
      idx === -1
        ? TIME_ESTIMATES[0]
        : idx >= TIME_ESTIMATES.length - 1
          ? null
          : TIME_ESTIMATES[idx + 1];
    update.mutate({ task, patch: { time_estimate_min: next } });
  }

  const estimatePill = (className: string) => (
    <button
      onClick={cycleEstimate}
      aria-label={tt("estimate")}
      className={cn(
        "shrink-0 cursor-pointer rounded-pill px-2 font-mono tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
        task.time_estimate_min
          ? "bg-bg text-muted hover:bg-border"
          : "bg-accent-soft text-accent hover:bg-accent-soft/70",
        className,
      )}
    >
      {task.time_estimate_min ? formatMinutes(task.time_estimate_min) : t("noEstimate")}
    </button>
  );

  return (
    <li
      className={cn(
        "flex items-center gap-2.5 rounded-[16px] bg-surface py-2 pr-2 pl-3.5 shadow-soft transition-shadow",
        // While estimating, the rows still missing a number are the ones to
        // look at; everything else steps back.
        estimating && task.time_estimate_min == null && "ring-2 ring-primary ring-inset",
      )}
    >
      {/* The title is the button; its ::after stretches over the whole text
          column so the meta line opens the task too, while the phone's
          estimate pill (raised above it) keeps its own click. */}
      <div className="relative flex min-w-0 flex-1 flex-col gap-px">
        <button
          onClick={() => openDetail(task)}
          className="cursor-pointer truncate rounded text-left text-[13px] font-semibold text-fg after:absolute after:inset-0 after:rounded after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus"
        >
          {task.title}
        </button>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
          <span
            className={cn("h-1.5 w-1.5 shrink-0 rounded-[2px]", !channel && "bg-border-strong")}
            style={channel ? { backgroundColor: channel.color } : undefined}
            aria-hidden
          />
          <span className="truncate">
            {channel
              ? t("rowMeta", {
                  category: channel.name,
                  age: labels.ageLabel(task.created_at, today),
                })
              : labels.ageLabel(task.created_at, today)}
          </span>
          {/* On the phone the pill moves down here: beside the buttons it
              squeezed titles to a word or two. */}
          {estimatePill("relative z-10 py-px text-[10px] sm:hidden")}
        </span>
      </div>

      {estimatePill("hidden py-[3px] text-[11px] sm:inline-block")}

      {/* "Hoy" isn't on the canvas, but pulling an idea into today is the
          other half of what the backlog is for. It stays, quieter than the
          tomorrow pill: text only until hovered. */}
      <button
        onClick={() => schedule(today, tcm("todayLower"))}
        className="h-8 shrink-0 cursor-pointer rounded-pill px-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none sm:px-2.5"
      >
        {td("plusToday")}
      </button>
      <button
        onClick={() => schedule(addDays(today, 1), tcm("tomorrowLower"))}
        aria-label={t("moveToTomorrow")}
        className="h-8 shrink-0 cursor-pointer rounded-pill bg-surface-2 px-2.5 text-xs font-semibold text-fg transition-colors hover:bg-border focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        <span className="hidden sm:inline">{t("moveToTomorrow")}</span>
        <span className="sm:hidden">{tcm("tomorrow")}</span>
      </button>
    </li>
  );
}
