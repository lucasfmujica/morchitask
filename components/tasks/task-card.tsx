"use client";

import { Clock, Pause, Play, Plus } from "lucide-react";
import { useDeleteTask, useToggleTask, useUpdateTask } from "@/lib/queries/tasks";
import { useToggleSubtaskByDate } from "@/lib/queries/subtasks";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { taskMetaVisibility, type Density } from "@/lib/task-meta";
import type { Channel, Profile, Subtask, Task } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { formatClock, formatMinutes, formatDuration, TIME_ESTIMATES } from "@/lib/format";
import { DEFAULT_TIMEZONE, timeInTimeZone } from "@/lib/date";
import { OwnerAvatar } from "./owner-avatar";
import { TaskCheckbox } from "./task-checkbox";
import { TaskMetaRow } from "./task-meta-row";
import { TaskReactions } from "./task-reactions";
import { useTaskTimer } from "./use-task-timer";

const TZ = DEFAULT_TIMEZONE;

/**
 * Rich, Sunsama-style task card. Used by the Day list and the Week columns.
 *
 * Laid out as a two-column grid — a fixed checkbox gutter and an elastic
 * content column — so the title, checklist, meta row and reactions all align
 * automatically. (Each of them used to carry a hand-computed `pl-[30px]`.)
 *
 * `density="compact"` is for the 320px week columns; see `lib/task-meta.ts`
 * for what it drops and why.
 */
export function TaskCard({
  task,
  channel,
  owner,
  subtasks = [],
  density = "comfortable",
}: {
  task: Task;
  channel?: Channel;
  owner?: Profile;
  subtasks?: Subtask[];
  density?: Density;
}) {
  const toggle = useToggleTask();
  const remove = useDeleteTask();
  const update = useUpdateTask();
  const toggleSub = useToggleSubtaskByDate(task.planned_date ?? "");
  const openDetail = useTaskDetail((s) => s.open);
  const timer = useTaskTimer(task);
  const me = useMe().data;
  const profiles = useProfiles().data ?? [];
  const done = task.status === "done";
  const compact = density === "compact";

  // A task that's mine but created by my partner = assigned to me.
  const assignedBy =
    task.owner_id === me?.id && task.created_by && task.created_by !== me?.id
      ? profiles.find((p) => p.id === task.created_by)
      : undefined;

  const vis = taskMetaVisibility({
    task,
    subtaskCount: subtasks.length,
    hasAssignedBy: !!assignedBy,
    timerRunning: timer.running,
    density,
  });

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

  const doneSubs = subtasks.filter((s) => s.done).length;

  return (
    <div
      className={cn(
        "group relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5 gap-y-2",
        "rounded-card border border-border bg-surface p-3 shadow-soft",
        // Scoped to transform/shadow: `transition-all` also animated colour, so
        // every theme toggle played a 200ms fade across every card on screen.
        "transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-card",
        compact && "gap-y-1.5 p-2.5",
        done && "opacity-65",
      )}
    >
      <span className="mt-0.5">
        <TaskCheckbox
          checked={done}
          onToggle={() => {
            if (timer.running) timer.stopTimer();
            toggle.mutate(task);
          }}
        />
      </span>

      {/* Title row: elastic title, fixed time controls — never wraps. */}
      <div className="flex min-w-0 items-start gap-2">
        <button
          onClick={() => openDetail(task)}
          className={cn(
            "min-w-0 flex-1 cursor-pointer rounded text-left leading-snug focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
            compact ? "text-sm" : "text-base",
            done ? "text-subtle line-through" : "text-fg",
          )}
        >
          {task.title}
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          {task.block_start && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-accent-soft px-1.5 py-0.5 text-2xs font-semibold text-accent">
              <Clock className="h-3 w-3" aria-hidden />
              {timeInTimeZone(task.block_start, TZ)}
            </span>
          )}
          {/* Stopwatch: running pill, or a play button (+ logged time if any) */}
          {vis.stopwatch &&
            (timer.running ? (
              <button
                onClick={timer.toggle}
                aria-label="Detener cronómetro"
                className="inline-flex cursor-pointer items-center gap-1 rounded-pill bg-primary-soft px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
              >
                <Pause className="h-3 w-3" aria-hidden />
                {formatClock(timer.liveSeconds)}
              </button>
            ) : (
              <button
                onClick={timer.toggle}
                aria-label="Iniciar cronómetro"
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 rounded-pill px-1.5 py-0.5 text-2xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                  task.actual_time_min
                    ? "bg-surface-2 text-muted hover:text-primary"
                    : "text-subtle opacity-0 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100",
                )}
              >
                <Play className="h-3 w-3" aria-hidden />
                {task.actual_time_min ? formatDuration(task.actual_time_min * 60) : null}
              </button>
            ))}
          {vis.estimate && (
            <button
              onClick={cycleEstimate}
              aria-label="Estimación de tiempo"
              title="Estimar tiempo"
              className={cn(
                "inline-flex cursor-pointer items-center rounded-pill px-1.5 py-0.5 text-2xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                task.time_estimate_min
                  ? "bg-surface-2 text-muted hover:bg-border"
                  : "text-subtle opacity-0 hover:text-muted focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100",
              )}
            >
              {task.time_estimate_min ? (
                formatMinutes(task.time_estimate_min)
              ) : (
                <Plus className="h-3 w-3" aria-hidden />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Checklist — day view only; compact collapses it to the n/m counter. */}
      {vis.checklist && (
        <ul className="col-start-2 flex flex-col gap-1">
          {subtasks.map((s) => {
            const assignee = s.assignee_id
              ? profiles.find((p) => p.id === s.assignee_id)
              : undefined;
            return (
              <li key={s.id} className="flex items-center gap-2">
                <TaskCheckbox
                  checked={s.done}
                  onToggle={() => toggleSub.mutate(s)}
                  size="sm"
                  label={s.done ? "Marcar pendiente" : "Completar ítem"}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    s.done ? "text-subtle line-through" : "text-muted",
                  )}
                >
                  {s.title}
                </span>
                {assignee && <OwnerAvatar profile={assignee} size={16} />}
              </li>
            );
          })}
        </ul>
      )}

      <TaskMetaRow
        className="col-start-2"
        task={task}
        channel={channel}
        owner={owner}
        assignedBy={assignedBy}
        doneSubtasks={doneSubs}
        totalSubtasks={subtasks.length}
        visibility={vis}
        onDelete={() => {
          timer.cancel();
          remove.mutate(task);
        }}
      />

      {/* Kudos on a finished shared task */}
      {task.shared && done && (
        <div className="col-start-2">
          <TaskReactions taskId={task.id} size="sm" />
        </div>
      )}
    </div>
  );
}
