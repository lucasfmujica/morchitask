"use client";

import { useMemo } from "react";
import { Inbox } from "lucide-react";
import { useChannels } from "@/lib/queries/channels";
import { useProfiles } from "@/lib/queries/profiles";
import { useBacklogTasks, useCreateTask, useReorderTask } from "@/lib/queries/tasks";
import type { Task } from "@/lib/queries/types";
import { orderForAppend } from "@/lib/ordering";
import { TaskComposer, type ComposerSubmit } from "@/components/tasks/task-composer";
import { TaskListSection } from "@/components/tasks/task-list-section";

export function BacklogView() {
  const tasksQ = useBacklogTasks();
  const channelsQ = useChannels();
  const profilesQ = useProfiles();
  const create = useCreateTask();
  const reorder = useReorderTask();

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const channelsById = useMemo(
    () => new Map((channelsQ.data ?? []).map((c) => [c.id, c])),
    [channelsQ.data],
  );
  const profilesById = useMemo(
    () => new Map((profilesQ.data ?? []).map((p) => [p.id, p])),
    [profilesQ.data],
  );

  function handleAdd(input: ComposerSubmit) {
    create.mutate({
      title: input.title,
      plannedDate: null,
      channelId: input.channelId,
      timeEstimateMin: input.timeEstimateMin,
      sortOrder: orderForAppend(tasks.map((t) => t.sort_order)),
    });
  }

  function handleReorder(task: Task, sortOrder: number) {
    reorder.mutate({ task, sortOrder });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 py-5">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Inbox className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">Backlog</h1>
          <p className="text-sm text-muted">
            {tasks.length > 0
              ? `${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"} sin fecha`
              : "Ideas y pendientes sin fecha."}
          </p>
        </div>
      </header>
      <TaskComposer channels={channelsQ.data ?? []} onSubmit={handleAdd} />
      <TaskListSection
        tasks={tasks}
        isLoading={tasksQ.isLoading}
        channelsById={channelsById}
        profilesById={profilesById}
        onReorder={handleReorder}
        emptyTitle="Backlog vacío"
        emptyHint="Guardá acá lo que no tiene día asignado."
      />
    </div>
  );
}
