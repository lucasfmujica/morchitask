"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Inbox } from "lucide-react";
import { useChannels, useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import {
  useBacklogTasks,
  useCreateTask,
  useMoveTaskToDate,
  useUpdateTask,
} from "@/lib/queries/tasks";
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
import { Button, EmptyState, SkeletonList } from "@/components/ui";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

/** Past this, an idea isn't waiting for a slot — it's waiting for a decision. */
const STALE_DAYS = 30;

/**
 * The backlog: everything without a day.
 *
 * Two things changed. Every row now carries its AGE, because how long an idea
 * has been sitting there is the fact that decides its fate and a list of bare
 * titles hides it. And scheduling is two buttons on the row (Hoy / Mañana)
 * rather than a trip through the task sheet.
 */
export function BacklogView() {
  const t = useTranslations("backlog");
  const tt = useTranslations("tasks");
  const tasksQ = useBacklogTasks();
  const channelsQ = useChannels();
  const channelLookupQ = useChannelLookup();
  const create = useCreateTask();
  const openDetail = useTaskDetail((s) => s.open);
  const { selected } = useChannelFilter();
  const today = todayISO();

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const filtering = selected.size > 0;
  const visibleTasks = useMemo(() => filterTasksByChannels(tasks, selected), [tasks, selected]);
  const channelsById = channelLookupQ.data ?? EMPTY_CHANNEL_MAP;

  const estimatedMin = tasks.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0);
  const unestimated = tasks.filter((t) => t.time_estimate_min == null);
  const stale = tasks.filter((t) => ageInDays(t.created_at, today) > STALE_DAYS);
  const [estimating, setEstimating] = useState(false);

  function handleAdd(input: ComposerSubmit) {
    create.mutate(
      {
        title: input.title,
        plannedDate: null,
        channelId: input.channelId,
        timeEstimateMin: input.timeEstimateMin,
        priority: input.priority,
        sortOrder: orderForAppend(tasks.map((t) => t.sort_order)),
      },
      // Open the new task's detail right away so you can flesh it out or
      // complete it without a separate click.
      { onSuccess: (task) => openDetail(task) },
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Inbox className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">{t("title")}</h1>
          {/* Real numbers, not "N tareas": what's here, how long it'd take, and
              how much of it you can't even weigh yet. */}
          <p className="truncate text-sm text-muted">
            {tasks.length > 0
              ? [
                  t("undated", { n: tasks.length }),
                  estimatedMin > 0 && t("estimated", { time: formatMinutes(estimatedMin) }),
                  unestimated.length > 0 && t("unestimated", { n: unestimated.length }),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : t("subtitle")}
          </p>
        </div>
        {unestimated.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => setEstimating((v) => !v)}
            aria-pressed={estimating}
          >
            {estimating ? t("doneEstimating") : t("estimateThem", { n: unestimated.length })}
          </Button>
        )}
      </header>

      <TaskComposer channels={channelsQ.data ?? []} onSubmit={handleAdd} />

      {tasksQ.isLoading ? (
        <SkeletonList />
      ) : visibleTasks.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filtering ? t("emptyCategory") : t("emptyTitle")}
          hint={filtering ? t("emptyCategoryHint") : t("emptyHint")}
          kbd="N"
          kbdHint={tt("kbdNewTask")}
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visibleTasks.map((task) => (
            <BacklogRow
              key={task.id}
              task={task}
              channel={task.channel_id ? channelsById.get(task.channel_id) : undefined}
              today={today}
              estimating={estimating}
            />
          ))}
        </ul>
      )}

      {/* The honest question nobody asks themselves unprompted. */}
      {stale.length > 0 && (
        <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
          <p className="text-sm font-semibold text-fg">{t("staleWarning", { n: stale.length })}</p>
          <p className="mt-1 text-xs text-muted">{t("staleAction")}</p>
        </section>
      )}
    </div>
  );
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

  return (
    <li
      className={cn(
        "relative flex items-center gap-2.5 overflow-hidden rounded-card border bg-surface py-2.5 pr-2.5 pl-3.5 shadow-soft",
        // While estimating, the rows still missing a number are the ones to
        // look at — everything else steps back.
        estimating && task.time_estimate_min == null ? "border-primary" : "border-border",
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-[3px]", !channel && "bg-border")}
        style={channel ? { background: channel.color } : undefined}
        aria-hidden
      />
      <button
        onClick={() => openDetail(task)}
        className="min-w-0 flex-1 cursor-pointer rounded text-left focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        <span className="block truncate text-sm text-fg">{task.title}</span>
        <span className="block truncate text-2xs text-muted">
          {channel ? `#${channel.name} · ` : ""}
          {labels.ageLabel(task.created_at, today)}
        </span>
      </button>

      <button
        onClick={cycleEstimate}
        aria-label={tt("estimate")}
        className={cn(
          "shrink-0 cursor-pointer rounded-pill px-2 py-0.5 text-2xs font-semibold tabular-nums transition-colors",
          task.time_estimate_min
            ? "bg-surface-2 text-muted hover:bg-border"
            : "border border-dashed border-border-strong text-subtle hover:text-muted",
        )}
      >
        {task.time_estimate_min ? formatMinutes(task.time_estimate_min) : tt("addTime")}
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => schedule(today, tcm("todayLower"))}
          className="cursor-pointer rounded-pill bg-primary/12 px-2.5 py-1 text-2xs font-bold text-primary transition-colors hover:bg-primary hover:text-on-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        >
          {td("plusToday")}
        </button>
        <button
          onClick={() => schedule(addDays(today, 1), tcm("tomorrowLower"))}
          aria-label={t("moveToTomorrow")}
          title={t("moveToTomorrow")}
          className="flex h-6 cursor-pointer items-center gap-1 rounded-pill bg-surface-2 px-2 text-2xs font-bold text-muted transition-colors hover:bg-border hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        >
          <CalendarClock className="h-3 w-3" aria-hidden />
          {tcm("tomorrow")}
        </button>
      </div>
    </li>
  );
}
