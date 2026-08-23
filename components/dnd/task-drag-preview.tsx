"use client";

import type { Channel, Profile, Task } from "@/lib/queries/types";
import type { Density } from "@/lib/task-meta";
import { cn } from "@/lib/utils";
import { formatMinutes } from "@/lib/format";
import { DEFAULT_TIMEZONE, timeInTimeZone } from "@/lib/date";
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
  const TZ = DEFAULT_TIMEZONE;

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

  // Mirrors TaskCard's anatomy exactly — rail, two lines, same paddings — so
  // the thing under your cursor is the thing you picked up.
  return (
    <div
      className={cn(
        "pointer-events-none relative grid h-full w-full gap-x-2.5 gap-y-1 overflow-hidden",
        "rotate-[1.5deg] cursor-grabbing rounded-card border border-primary/40 bg-surface shadow-drag",
        compact
          ? "grid-cols-[1.125rem_minmax(0,1fr)] py-[9px] pr-2.5 pl-3"
          : "grid-cols-[1.25rem_minmax(0,1fr)] py-2.5 pr-3 pl-3.5",
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-[3px]", !channel && "bg-border")}
        style={channel ? { background: channel.color } : undefined}
        aria-hidden
      />

      {/* Static stand-in for the checkbox — same footprint, no behaviour. */}
      <span
        className={cn(
          "mt-px rounded-md border-2 border-border-strong",
          compact ? "h-4 w-4" : "h-5 w-5",
        )}
        aria-hidden
      />

      <div className="flex min-w-0 items-baseline gap-2">
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium",
            compact ? "text-sm leading-[18px]" : "text-base leading-5",
            done ? "text-subtle line-through" : "text-fg",
          )}
        >
          {task.title}
        </span>
        {task.time_estimate_min ? (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
            {formatMinutes(task.time_estimate_min)}
          </span>
        ) : null}
      </div>

      <div className="col-start-2 flex min-w-0 items-center gap-2 text-2xs text-muted">
        {task.block_start && (
          <span className="shrink-0 font-semibold text-accent">
            {timeInTimeZone(task.block_start, TZ)}
          </span>
        )}
        {channel && <span className="min-w-0 truncate font-medium">#{channel.name}</span>}
        <span className="ml-auto shrink-0">
          <OwnerAvatar profile={owner} />
        </span>
      </div>
    </div>
  );
}
