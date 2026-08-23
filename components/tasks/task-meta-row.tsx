"use client";

import { Clock, Pause, Play, StickyNote, Trash2, Users } from "lucide-react";
import type { MetaVisibility } from "@/lib/task-meta";
import type { Channel, Profile, Task } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { formatClock, formatDuration } from "@/lib/format";
import { DEFAULT_TIMEZONE, timeInTimeZone } from "@/lib/date";
import { ObjectiveBadge } from "@/components/objectives/objective-badge";
import { DueDateBadge } from "./due-date-badge";
import { MoveToDayMenu } from "./move-to-day-menu";
import { OwnerAvatar } from "./owner-avatar";
import type { useTaskTimer } from "./use-task-timer";

const TZ = DEFAULT_TIMEZONE;

/**
 * The card's second line — and the only one, so it is exactly one line tall no
 * matter how much metadata a task carries.
 *
 *   [ 🕐 14:30  #Trabajo  vence ]        [ ▬▬▬ 2/3  ▶  ⋯  who  🗑 ]
 *   └─ when and what, elastic ───┘        └─ progress + affordances, fixed ─┘
 *
 * Only the category name shrinks (it truncates). Everything on the right is
 * `shrink-0`. The scheduled time leads in `--accent` because "when" is the
 * first thing you look for; the category is plain text now that the 3px rail
 * carries its colour.
 */
export function TaskMetaRow({
  task,
  channel,
  owner,
  assignedBy,
  doneSubtasks,
  totalSubtasks,
  visibility: vis,
  compact = false,
  timer,
  onDelete,
  className,
}: {
  task: Task;
  channel?: Channel;
  owner?: Profile;
  assignedBy?: Profile;
  doneSubtasks: number;
  totalSubtasks: number;
  visibility: MetaVisibility;
  compact?: boolean;
  timer?: ReturnType<typeof useTaskTimer>;
  onDelete: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2 text-2xs text-muted", className)}>
      {/* When and what. */}
      {task.block_start && (
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent">
          <Clock className="h-[11px] w-[11px]" aria-hidden />
          {timeInTimeZone(task.block_start, TZ)}
        </span>
      )}
      {vis.channel && channel && (
        <span className="min-w-0 truncate font-medium">#{channel.name}</span>
      )}
      {vis.due && task.due_date && <DueDateBadge dueDate={task.due_date} />}
      {vis.note &&
        (vis.iconOnly ? (
          <StickyNote className="h-3 w-3 shrink-0 text-subtle" aria-label="Tiene notas" />
        ) : (
          <span className="shrink-0 text-subtle">· nota</span>
        ))}
      {vis.objective && task.objective_id && (
        <ObjectiveBadge objectiveId={task.objective_id} iconOnly={vis.iconOnly} />
      )}
      {vis.shared && <Users className="h-3 w-3 shrink-0 text-primary" aria-label="Compartida" />}
      {vis.assignedBy && assignedBy && (
        <span className="shrink-0" title={`Te la asignó ${assignedBy.display_name}`}>
          <OwnerAvatar profile={assignedBy} size={14} />
        </span>
      )}

      {/* Progress and affordances — never shrinks, always hard right. */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {vis.subtaskCount && totalSubtasks > 0 && (
          <ChecklistMeter done={doneSubtasks} total={totalSubtasks} compact={compact} />
        )}
        {timer &&
          vis.stopwatch &&
          (timer.running ? (
            <button
              onClick={timer.toggle}
              aria-label="Detener cronómetro"
              className="inline-flex cursor-pointer items-center gap-1 rounded-pill bg-primary-soft px-1.5 py-0.5 font-semibold tabular-nums text-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              <Pause className="h-3 w-3" aria-hidden />
              {formatClock(timer.liveSeconds)}
            </button>
          ) : (
            <button
              onClick={timer.toggle}
              aria-label="Iniciar cronómetro"
              className={cn(
                "inline-flex cursor-pointer items-center gap-1 rounded-pill px-1 py-0.5 font-semibold transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                task.actual_time_min
                  ? "text-muted hover:text-primary"
                  : "text-subtle opacity-0 hover:text-primary group-hover:opacity-100 touch:opacity-100",
              )}
            >
              <Play className="h-3 w-3" aria-hidden />
              {task.actual_time_min ? formatDuration(task.actual_time_min * 60) : null}
            </button>
          ))}
        {vis.moveMenu && <MoveToDayMenu task={task} />}
        <OwnerAvatar profile={owner} />
        {vis.deleteButton && (
          <button
            onClick={onDelete}
            aria-label="Eliminar tarea"
            className="cursor-pointer rounded text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none group-hover:opacity-100 touch:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The checklist as three segments plus `2/3` — the whole reason the card can be
 * two lines tall. Always three segments regardless of the item count: this is a
 * glance, not a count, and a variable number of pills would make cards ragged
 * again. The counter next to it carries the exact figure.
 */
function ChecklistMeter({
  done,
  total,
  compact,
}: {
  done: number;
  total: number;
  compact: boolean;
}) {
  const filled = total > 0 ? Math.round((done / total) * 3) : 0;
  return (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums text-muted"
      title={`${done} de ${total} ítems`}
    >
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-[3px] rounded-pill",
              compact ? "w-2" : "w-2.5",
              i < filled ? "bg-primary" : "bg-surface-2",
            )}
          />
        ))}
      </span>
      {done}/{total}
    </span>
  );
}
