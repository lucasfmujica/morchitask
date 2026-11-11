"use client";

import type { ReactNode } from "react";
import { ListChecks, type LucideIcon } from "lucide-react";
import type { PriorityKey } from "@/lib/priority";
import type { Channel, Profile, Subtask, Task } from "@/lib/queries/types";
import { SortableTaskList } from "@/components/dnd/sortable-task-list";
import { EmptyState, SkeletonList, Well } from "@/components/ui";
import { useTranslations } from "next-intl";

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
  emptyAction,
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
  /** Buttons under the empty state — the next move, not just a shrug. */
  emptyAction?: ReactNode;
  /** Share a parent DndContext (day view) so tasks can be dragged to the calendar. */
  hosted?: boolean;
  /** Show priority group separators and drop strips. */
  grouped?: boolean;
  /** Day this list belongs to — scopes the group droppable ids. */
  scope?: string;
  /** A drag is in progress (reveals empty-group strips). */
  dragging?: boolean;
}) {
  const t = useTranslations("tasks");
  // The list lives in a well: a grey tray with the cards as white tiles on it.
  // Loading and empty states sit in the same tray so the page doesn't jump
  // between a bare skeleton and a framed list once the query lands.
  if (isLoading)
    return (
      <Well>
        <SkeletonList />
      </Well>
    );
  if (tasks.length === 0)
    return (
      <Well>
        <EmptyState
          icon={emptyIcon ?? ListChecks}
          title={emptyTitle}
          hint={emptyHint}
          action={emptyAction}
          kbd="N"
          kbdHint={t("kbdNewTask")}
          className="border-transparent bg-surface/60"
        />
      </Well>
    );

  return (
    <Well>
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
    </Well>
  );
}
