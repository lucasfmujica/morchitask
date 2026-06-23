"use client";

import { useToggleTask } from "@/lib/queries/tasks";
import { useTaskDetail } from "@/lib/stores/task-detail";
import type { Channel, Profile, Task } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { TaskCheckbox } from "./task-checkbox";

/** A lightweight task row for dense views (week / agenda). Toggle + read;
 *  full editing lives in the Day view. */
export function CompactTaskRow({
  task,
  channel,
  owner,
}: {
  task: Task;
  channel?: Channel;
  owner?: Profile;
}) {
  const toggle = useToggleTask();
  const openDetail = useTaskDetail((s) => s.open);
  const done = task.status === "done";

  return (
    <div className="flex items-center gap-2 py-1">
      <TaskCheckbox checked={done} onToggle={() => toggle.mutate(task)} size="sm" />
      {channel && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: channel.color }}
          aria-hidden
        />
      )}
      <button
        onClick={() => openDetail(task)}
        className={cn(
          "min-w-0 flex-1 cursor-pointer truncate text-left text-sm",
          done ? "text-subtle line-through" : "text-fg",
        )}
      >
        {task.title}
      </button>
      {owner && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: owner.color }}
          title={owner.display_name}
          aria-label={`Asignado a ${owner.display_name}`}
        />
      )}
    </div>
  );
}
