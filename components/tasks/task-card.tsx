"use client";

import { Plus } from "lucide-react";
import { useDeleteTask, useToggleTask, useUpdateTask } from "@/lib/queries/tasks";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { useToast } from "@/lib/stores/toast";
import { taskMetaVisibility, type Density } from "@/lib/task-meta";
import type { Channel, Profile, Subtask, Task } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { formatMinutes, TIME_ESTIMATES } from "@/lib/format";
import { TaskCheckbox } from "./task-checkbox";
import { TaskMetaRow } from "./task-meta-row";
import { useTaskTimer } from "./use-task-timer";
import { useTranslations } from "next-intl";

/**
 * The task card: exactly two lines, always, and no colour but the category's
 * small square.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ○ Rehacer portadas LUMA                   1h │  title · duration
 *   │   ■ Trabajo  VIE 13/11          ▬▬▬ 2/3   ⋯  │  what · when · progress
 *   └──────────────────────────────────────────────┘
 *
 * The point of the fixed two lines is that every card in a list measures the
 * same. What used to make them ragged — a wrapping chip footer, an inline
 * checklist that grew the card by one row per subtask — is gone: the checklist
 * now reads as three segments plus `2/3`, and its items are edited in the
 * detail sheet.
 *
 * There used to be a 3px category rail down the left edge; it went with the
 * bento redesign (a coloured left border is the most recognisable "generated
 * UI" tell). `density="compact"` is the week column: same anatomy, tighter.
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
  const t = useTranslations("tasks");
  const toggle = useToggleTask();
  const remove = useDeleteTask();
  const update = useUpdateTask();
  const openDetail = useTaskDetail((s) => s.open);
  const timer = useTaskTimer(task);
  const toast = useToast();
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

  function handleToggle() {
    if (timer.running) timer.stopTimer();
    toggle.mutate(task);
    toast(done ? t("markedPending") : t("done"), {
      label: t("undo"),
      run: () => toggle.mutate({ ...task, status: done ? "todo" : "done" } as Task),
    });
  }

  // A finished task shows what it really took; an open one shows the estimate.
  const rightLabel =
    done && task.actual_time_min
      ? formatMinutes(task.actual_time_min)
      : task.time_estimate_min
        ? formatMinutes(task.time_estimate_min)
        : null;

  // The duration, editable by tapping. On the comfortable card it closes line 1;
  // in the narrow week column it moves to line 2 so the title gets the width.
  const estimateControl = (
    <>
      {rightLabel ? (
        <button
          onClick={cycleEstimate}
          disabled={done}
          aria-label={t("estimate")}
          title={done ? t("measuredTime") : t("estimateTime")}
          className="shrink-0 cursor-pointer rounded font-mono text-xs text-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none disabled:cursor-default disabled:hover:text-muted"
        >
          {rightLabel}
        </button>
      ) : (
        vis.estimate &&
        !done && (
          <button
            onClick={cycleEstimate}
            aria-label={t("estimateTime")}
            title={t("estimateTime")}
            className="shrink-0 cursor-pointer rounded text-subtle opacity-0 transition-opacity hover:text-muted focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none group-hover:opacity-100 touch:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        )
      )}
    </>
  );

  return (
    <div
      className={cn(
        "group relative grid gap-x-2.5 gap-y-0.5",
        // A white tile on a well: the shadow separates it, so no hairline border
        // (kept transparent so the box doesn't shift if a border state returns).
        "rounded-card border border-transparent bg-surface shadow-soft",
        // Scoped to transform/shadow: `transition-all` also animated colour, so
        // every theme toggle played a 200ms fade across every card on screen.
        "transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-card",
        compact
          ? "grid-cols-[1.125rem_minmax(0,1fr)] px-2.5 py-2"
          : "grid-cols-[1.375rem_minmax(0,1fr)] px-3 py-2",
        done && "opacity-65",
      )}
    >
      <span className="mt-px">
        <TaskCheckbox checked={done} onToggle={handleToggle} size={compact ? "sm" : "md"} />
      </span>

      {/* Line 1 — title, and the duration hard-right. Never wraps. */}
      <div className="flex min-w-0 items-baseline gap-2">
        <button
          onClick={() => openDetail(task)}
          className={cn(
            "min-w-0 flex-1 cursor-pointer truncate rounded text-left font-medium focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
            compact ? "text-sm leading-[18px] font-semibold" : "text-sm leading-5 font-semibold",
            done ? "text-subtle line-through" : "text-fg",
          )}
        >
          {task.title}
        </button>

        {!compact && estimateControl}
      </div>

      {/* Line 2 — when · what, then progress and the affordances. */}
      <TaskMetaRow
        className="col-start-2"
        task={task}
        channel={channel}
        owner={owner}
        assignedBy={assignedBy}
        doneSubtasks={subtasks.filter((s) => s.done).length}
        totalSubtasks={subtasks.length}
        visibility={vis}
        compact={compact}
        timer={timer}
        showOwner={!!owner && owner.id !== me?.id}
        trailing={compact ? estimateControl : undefined}
        onDelete={() => {
          timer.cancel();
          remove.mutate(task);
        }}
      />
    </div>
  );
}
