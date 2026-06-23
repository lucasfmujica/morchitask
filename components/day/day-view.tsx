"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Moon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useChannels } from "@/lib/queries/channels";
import { useProfiles } from "@/lib/queries/profiles";
import { useSubtasksForDate } from "@/lib/queries/subtasks";
import { useCreateTask, useReorderTask, useTasksForDate, taskKeys } from "@/lib/queries/tasks";
import { ensureDayMaterialized } from "@/lib/queries/routines";
import type { Task } from "@/lib/queries/types";
import { orderForAppend } from "@/lib/ordering";
import { cn } from "@/lib/utils";
import { DateNavigator } from "@/components/layout/date-navigator";
import { TaskComposer, type ComposerSubmit } from "@/components/tasks/task-composer";
import { TaskListSection } from "@/components/tasks/task-list-section";
import { AgendaView } from "./agenda-view";
import { DaySummary } from "./day-summary";

type Mode = "list" | "agenda";

export function DayView({ date }: { date: string }) {
  const [mode, setMode] = useState<Mode>("list");
  const qc = useQueryClient();

  // Generate this day's recurring routine instances on open (idempotent).
  useEffect(() => {
    ensureDayMaterialized(date)
      .then(() => qc.invalidateQueries({ queryKey: taskKeys.date(date) }))
      .catch(() => {});
  }, [date, qc]);

  const tasksQ = useTasksForDate(date);
  const channelsQ = useChannels();
  const profilesQ = useProfiles();
  const subtasksQ = useSubtasksForDate(date);
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
  const subtasksByTaskId = useMemo(() => subtasksQ.data ?? new Map(), [subtasksQ.data]);

  function handleAdd(input: ComposerSubmit) {
    create.mutate({
      title: input.title,
      plannedDate: date,
      channelId: input.channelId,
      timeEstimateMin: input.timeEstimateMin,
      sortOrder: orderForAppend(tasks.map((t) => t.sort_order)),
    });
  }

  function handleReorder(task: Task, sortOrder: number) {
    reorder.mutate({ task, sortOrder });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 py-5 lg:max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <DateNavigator date={date} />
        </div>
        <Link
          href={`/shutdown/${date}`}
          className="mt-1 inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <Moon className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Cerrar día</span>
        </Link>
      </div>
      <DaySummary tasks={tasks} />
      <TaskComposer channels={channelsQ.data ?? []} onSubmit={handleAdd} />

      {/* Mobile: tabs switch Lista/Agenda. Desktop: both side by side. */}
      <div className="lg:hidden">
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        <div className={cn("lg:block", mode === "list" ? "block" : "hidden")}>
          <TaskListSection
            tasks={tasks}
            isLoading={tasksQ.isLoading}
            channelsById={channelsById}
            profilesById={profilesById}
            subtasksByTaskId={subtasksByTaskId}
            onReorder={handleReorder}
            emptyTitle="Sin tareas todavía"
            emptyHint="Agregá tu primera tarea del día arriba."
          />
        </div>
        <div className={cn("lg:block", mode === "agenda" ? "block" : "hidden")}>
          <p className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-subtle lg:block">
            Agenda
          </p>
          <AgendaView date={date} tasks={tasks} channelsById={channelsById} />
        </div>
      </div>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex w-fit gap-1 rounded-pill border border-border bg-surface-2 p-0.5">
      {(["list", "agenda"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={cn(
            "cursor-pointer rounded-pill px-3 py-1 text-sm font-medium transition-colors",
            mode === m ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
          )}
        >
          {m === "list" ? "Lista" : "Agenda"}
        </button>
      ))}
    </div>
  );
}
