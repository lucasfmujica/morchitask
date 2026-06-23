"use client";

import { ListChecks } from "lucide-react";
import type { Channel, Profile, Subtask, Task } from "@/lib/queries/types";
import { SortableTaskList } from "@/components/dnd/sortable-task-list";

export function TaskListSection({
  tasks,
  isLoading,
  channelsById,
  profilesById,
  subtasksByTaskId,
  onReorder,
  emptyTitle,
  emptyHint,
}: {
  tasks: Task[];
  isLoading: boolean;
  channelsById: Map<string, Channel>;
  profilesById: Map<string, Profile>;
  subtasksByTaskId?: Map<string, Subtask[]>;
  onReorder: (task: Task, sortOrder: number) => void;
  emptyTitle: string;
  emptyHint: string;
}) {
  if (isLoading) return <SkeletonList />;
  if (tasks.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;

  return (
    <SortableTaskList
      tasks={tasks}
      channelsById={channelsById}
      profilesById={profilesById}
      subtasksByTaskId={subtasksByTaskId}
      onReorder={onReorder}
    />
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[52px] animate-pulse rounded-xl border border-border bg-surface-2"
        />
      ))}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <ListChecks className="h-6 w-6" aria-hidden />
      </span>
      <div>
        <p className="font-semibold text-fg">{title}</p>
        <p className="mt-1 text-sm text-muted">{hint}</p>
      </div>
    </div>
  );
}
