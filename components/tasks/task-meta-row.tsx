"use client";

import { StickyNote, Trash2, Users } from "lucide-react";
import type { MetaVisibility } from "@/lib/task-meta";
import type { Channel, Profile, Task } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { ObjectiveBadge } from "@/components/objectives/objective-badge";
import { DueDateBadge } from "./due-date-badge";
import { PriorityBadge } from "./priority-badge";
import { MoveToDayMenu } from "./move-to-day-menu";
import { OwnerAvatar } from "./owner-avatar";

/**
 * The bottom row of a task card.
 *
 * Two clusters, and critically NO `flex-wrap`:
 *
 *   [ priority · #channel · due ]            [ 3/5 note goal shared who ⋯ ]
 *   └─ identity, elastic ─────────┘          └─ affordances, fixed ───────┘
 *
 * Only the channel name may shrink (it truncates). Everything on the right is
 * `shrink-0`, so the row is exactly one line tall no matter how much metadata
 * a task carries — which is what stops week-column cards from each being a
 * different height.
 */
export function TaskMetaRow({
  task,
  channel,
  owner,
  assignedBy,
  doneSubtasks,
  totalSubtasks,
  visibility: vis,
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
  onDelete: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {/* Identity — what this task IS. Elastic; only the name truncates. */}
      <div className="flex min-w-0 items-center gap-1.5">
        {vis.priority && <PriorityBadge priority={task.priority} />}
        {vis.channel && channel && (
          <span className="inline-flex min-w-0 items-center gap-1 text-2xs font-medium text-muted">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: channel.color }}
              aria-hidden
            />
            <span className="truncate">#{channel.name}</span>
          </span>
        )}
        {vis.due && task.due_date && <DueDateBadge dueDate={task.due_date} />}
      </div>

      {/* Affordances — what you can DO, plus at-a-glance markers. Never shrinks. */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {vis.subtaskCount && totalSubtasks > 0 && (
          <span
            className="text-2xs tabular-nums text-subtle"
            title={`${doneSubtasks} de ${totalSubtasks} ítems`}
          >
            {doneSubtasks}/{totalSubtasks}
          </span>
        )}
        {vis.note &&
          (vis.iconOnly ? (
            <StickyNote className="h-3 w-3 text-subtle" aria-label="Tiene notas" />
          ) : (
            <span className="text-2xs text-subtle">· nota</span>
          ))}
        {vis.objective && task.objective_id && (
          <ObjectiveBadge objectiveId={task.objective_id} iconOnly={vis.iconOnly} />
        )}
        {vis.shared &&
          (vis.iconOnly ? (
            <Users className="h-3 w-3 text-primary" aria-label="Compartida" />
          ) : (
            <span
              className="inline-flex items-center gap-1 text-2xs font-medium text-primary"
              title="Compartida"
            >
              <Users className="h-3 w-3" aria-hidden />
              compartida
            </span>
          ))}
        {vis.assignedBy &&
          assignedBy &&
          (vis.iconOnly ? (
            <OwnerAvatar profile={assignedBy} size={14} />
          ) : (
            <span
              className="inline-flex items-center gap-1 text-2xs font-medium text-accent"
              title={`Te la asignó ${assignedBy.display_name}`}
            >
              de {assignedBy.display_name}
            </span>
          ))}
        {vis.moveMenu && <MoveToDayMenu task={task} />}
        <OwnerAvatar profile={owner} />
        {vis.deleteButton && (
          <button
            onClick={onDelete}
            aria-label="Eliminar tarea"
            className="cursor-pointer rounded text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none group-hover:opacity-100 touch:opacity-100"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
