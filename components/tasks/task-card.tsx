"use client";

import { Clock, Trash2, Users } from "lucide-react";
import { useDeleteTask, useToggleTask, useUpdateTask } from "@/lib/queries/tasks";
import { useToggleSubtaskByDate } from "@/lib/queries/subtasks";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { useTaskDetail } from "@/lib/stores/task-detail";
import type { Channel, Profile, Subtask, Task } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { formatMinutes } from "@/lib/format";
import { DEFAULT_TIMEZONE, timeInTimeZone } from "@/lib/date";
import { ObjectiveBadge } from "@/components/objectives/objective-badge";
import { OwnerAvatar } from "./owner-avatar";
import { TaskCheckbox } from "./task-checkbox";

const ESTIMATES = [15, 30, 45, 60, 90];
const TZ = DEFAULT_TIMEZONE;

/** Rich, Sunsama-style task card: scheduled-time pill, duration chip, inline
 *  checklist (toggleable) and category tag. Used by the Day list and Week columns. */
export function TaskCard({
  task,
  channel,
  owner,
  subtasks = [],
}: {
  task: Task;
  channel?: Channel;
  owner?: Profile;
  subtasks?: Subtask[];
}) {
  const toggle = useToggleTask();
  const remove = useDeleteTask();
  const update = useUpdateTask();
  const toggleSub = useToggleSubtaskByDate(task.planned_date ?? "");
  const openDetail = useTaskDetail((s) => s.open);
  const me = useMe().data;
  const profiles = useProfiles().data ?? [];
  const done = task.status === "done";

  // A task that's mine but created by my partner = assigned to me.
  const assignedBy =
    task.owner_id === me?.id && task.created_by && task.created_by !== me?.id
      ? profiles.find((p) => p.id === task.created_by)
      : undefined;

  function cycleEstimate() {
    const cur = task.time_estimate_min;
    const idx = cur ? ESTIMATES.indexOf(cur) : -1;
    const next =
      idx === -1 ? ESTIMATES[0] : idx >= ESTIMATES.length - 1 ? null : ESTIMATES[idx + 1];
    update.mutate({ task, patch: { time_estimate_min: next } });
  }

  const doneSubs = subtasks.filter((s) => s.done).length;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-soft transition-all duration-200 hover:-translate-y-px hover:shadow-card",
        done && "opacity-65",
      )}
    >
      {/* Top: scheduled-time pill (left) + duration chip (right) */}
      <div className="flex items-center gap-2">
        {task.block_start && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
            <Clock className="h-3 w-3" aria-hidden />
            {timeInTimeZone(task.block_start, TZ)}
          </span>
        )}
        <button
          onClick={cycleEstimate}
          aria-label="Estimación de tiempo"
          className={cn(
            "ml-auto cursor-pointer rounded-full px-1.5 py-0.5 text-[11px] font-semibold transition-all",
            task.time_estimate_min
              ? "bg-surface-2 text-muted hover:bg-border"
              : "text-subtle opacity-0 hover:text-muted group-hover:opacity-100 touch:opacity-100",
          )}
        >
          {task.time_estimate_min ? formatMinutes(task.time_estimate_min) : "+ tiempo"}
        </button>
      </div>

      {/* Title row */}
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5">
          <TaskCheckbox checked={done} onToggle={() => toggle.mutate(task)} />
        </span>
        <button
          onClick={() => openDetail(task)}
          className={cn(
            "min-w-0 flex-1 cursor-pointer text-left text-[15px] leading-snug",
            done ? "text-subtle line-through" : "text-fg",
          )}
        >
          {task.title}
        </button>
      </div>

      {/* Checklist */}
      {subtasks.length > 0 && (
        <ul className="flex flex-col gap-1 pl-[30px]">
          {subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <TaskCheckbox
                checked={s.done}
                onToggle={() => toggleSub.mutate(s)}
                size="sm"
                label={s.done ? "Marcar pendiente" : "Completar ítem"}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px]",
                  s.done ? "text-subtle line-through" : "text-muted",
                )}
              >
                {s.title}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Footer: category + notes/checklist meta (left), owner + delete (right) */}
      <div className="flex items-center gap-2 pl-[30px]">
        {channel && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: channel.color }}
              aria-hidden
            />
            #{channel.name}
          </span>
        )}
        {subtasks.length > 0 && (
          <span className="text-[11px] text-subtle">
            {doneSubs}/{subtasks.length}
          </span>
        )}
        {task.objective_id && <ObjectiveBadge objectiveId={task.objective_id} />}
        {task.notes && <span className="text-[11px] text-subtle">· nota</span>}
        {task.shared && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"
            title="Compartida"
          >
            <Users className="h-3 w-3" aria-hidden />
            compartida
          </span>
        )}
        {assignedBy && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent"
            title={`Te la asignó ${assignedBy.display_name}`}
          >
            de {assignedBy.display_name}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <OwnerAvatar profile={owner} />
          <button
            onClick={() => remove.mutate(task)}
            aria-label="Eliminar tarea"
            className="cursor-pointer text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
