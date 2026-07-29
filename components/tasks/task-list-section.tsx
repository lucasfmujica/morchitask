"use client";

import { ListChecks, type LucideIcon } from "lucide-react";
import type { PriorityKey } from "@/lib/priority";
import type { Channel, Profile, Subtask, Task } from "@/lib/queries/types";
import { SortableTaskList } from "@/components/dnd/sortable-task-list";
import { EmptyState, SkeletonList } from "@/components/ui";

export function TaskListSection({
  tasks,
  isLoading,
  channelsById,
  profilesById,
  subtasksByTaskId,
  onReorder,
  emptyTitle,
  emptyHint,
  emptyIcon,
  hosted = false,
  grouped = false,
  scope = "",
  dragging = false,
}: {
  tasks: Task[];
  isLoading: boolean;
  channelsById: Map<string, Channel>;
  profilesById: Map<string, Profile>;
  subtasksByTaskId?: Map<string, Subtask[]>;
  onReorder: (task: Task, sortOrder: number, priority?: PriorityKey) => void;
  emptyTitle: string;
  emptyHint: string;
  emptyIcon?: LucideIcon;
  /** Share a parent DndContext (day view) so tasks can be dragged to the calendar. */
  hosted?: boolean;
  /** Show priority group separators and drop strips. */
  grouped?: boolean;
  /** Day this list belongs to — scopes the group droppable ids. */
  scope?: string;
  /** A drag is in progress (reveals empty-group strips). */
  dragging?: boolean;
}) {
  if (isLoading) return <SkeletonList />;
  if (tasks.length === 0)
    return (
      <EmptyState
        icon={emptyIcon ?? ListChecks}
        title={emptyTitle}
        hint={emptyHint}
        kbd="N"
        kbdHint="para una nueva tarea"
      />
    );

  return (
    <SortableTaskList
      tasks={tasks}
      channelsById={channelsById}
      profilesById={profilesById}
      subtasksByTaskId={subtasksByTaskId}
      onReorder={onReorder}
      hosted={hosted}
      grouped={grouped}
      scope={scope}
      dragging={dragging}
    />
  );
}
