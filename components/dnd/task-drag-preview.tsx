"use client";

import type { Channel, Profile, Task } from "@/lib/queries/types";
import type { Density } from "@/lib/task-meta";
import { cn } from "@/lib/utils";
import { DueDateBadge } from "@/components/tasks/due-date-badge";
import { PriorityBadge } from "@/components/tasks/priority-badge";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";

/**
 * What you see under the cursor while dragging a task.
 *
 * Deliberately NOT `<TaskCard>`: that mounts seven hooks (mutations, the timer
 * store, the detail store, profiles). A second live instance mid-drag would
 * double-subscribe the timer and put clickable controls under the pointer.
 * This is inert — no hooks, no handlers, `pointer-events-none`.
 *
 * `variant`:
 *  - "card"  — dragging a card from a list or week column. dnd-kit sizes the
 *    overlay to the source element's measured rect, so `h-full w-full` makes it
 *    match the card you picked up. (The old preview sized itself, which is why
 *    it read as a detached label rather than the object being moved.)
 *  - "pill"  — dragging a block on the agenda grid, where the source can be
 *    ~28px tall. A card would be crushed; a label is the honest preview.
 */
export function TaskDragPreview({
  task,
  channel,
  owner,
  density = "comfortable",
  variant = "card",
}: {
  task: Task;
  channel?: Channel;
  owner?: Profile;
  density?: Density;
  variant?: "card" | "pill";
}) {
  if (variant === "pill") {
    return (
      <div className="pointer-events-none inline-flex cursor-grabbing items-center gap-1.5 rounded-lg border border-primary bg-surface px-2.5 py-1.5 text-xs font-medium text-fg shadow-drag">
        {channel && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: channel.color }}
            aria-hidden
          />
        )}
        <span className="truncate">{task.title}</span>
      </div>
    );
  }

  const compact = density === "compact";
  const done = task.status === "done";

  return (
    <div
      className={cn(
        "pointer-events-none grid h-full w-full grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5 gap-y-2",
        "rotate-[1.5deg] cursor-grabbing rounded-card border border-primary/40 bg-surface p-3 shadow-drag",
        compact && "gap-y-1.5 p-2.5",
      )}
    >
      {/* Static stand-in for the checkbox — same footprint, no behaviour. */}
      <span className="mt-0.5 h-5 w-5 rounded-sm border-2 border-border-strong" aria-hidden />

      <div className="flex min-w-0 items-start">
        <span
          className={cn(
            "min-w-0 flex-1 truncate leading-snug",
            compact ? "text-sm" : "text-base",
            done ? "text-subtle line-through" : "text-fg",
          )}
        >
          {task.title}
        </span>
      </div>

      <div className="col-start-2 flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          {channel && (
            <span className="inline-flex min-w-0 items-center gap-1 text-2xs font-medium text-muted">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: channel.color }}
                aria-hidden
              />
              <span className="truncate">#{channel.name}</span>
            </span>
          )}
          {task.due_date && !done && <DueDateBadge dueDate={task.due_date} />}
        </div>
        <div className="ml-auto shrink-0">
          <OwnerAvatar profile={owner} />
        </div>
      </div>
    </div>
  );
}
