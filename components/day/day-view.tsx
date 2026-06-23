"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Moon, Sparkles, Sun } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useChannels } from "@/lib/queries/channels";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { useSubtasksForDate } from "@/lib/queries/subtasks";
import { useCreateTask, useReorderTask, useTasksForDate, taskKeys } from "@/lib/queries/tasks";
import { ensureDayMaterialized } from "@/lib/queries/routines";
import type { Task } from "@/lib/queries/types";
import { orderForAppend } from "@/lib/ordering";
import { cn } from "@/lib/utils";
import { DateNavigator } from "@/components/layout/date-navigator";
import { TaskComposer, type ComposerSubmit } from "@/components/tasks/task-composer";
import { TaskListSection } from "@/components/tasks/task-list-section";
import { Confetti } from "@/components/ui/confetti";
import { AgendaView } from "./agenda-view";
import { CapacityBar, DEFAULT_CAPACITY_MIN } from "./capacity-bar";
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
  const me = useMe().data;
  const create = useCreateTask();
  const reorder = useReorderTask();

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const myTasks = useMemo(() => tasks.filter((t) => t.owner_id === me?.id), [tasks, me?.id]);
  const myPlannedMin = useMemo(
    () => myTasks.reduce((sum, t) => sum + (t.time_estimate_min ?? 0), 0),
    [myTasks],
  );

  // Celebrate the moment you finish everything for the day (once per completion).
  const allMineDone = myTasks.length > 0 && myTasks.every((t) => t.status === "done");
  const [celebrate, setCelebrate] = useState(false);
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (allMineDone && !celebratedRef.current) {
      celebratedRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCelebrate(true);
    } else if (!allMineDone) {
      celebratedRef.current = false;
    }
  }, [allMineDone]);
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
    <div className="flex max-w-3xl flex-col gap-4 lg:max-w-5xl">
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <DateNavigator date={date} />
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-0.5">
          <Link
            href={`/plan/${date}`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Sun className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Planificar</span>
          </Link>
          <Link
            href={`/shutdown/${date}`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Moon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Cerrar día</span>
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <DaySummary tasks={tasks} />
        {myPlannedMin > 0 && (
          <CapacityBar
            plannedMin={myPlannedMin}
            targetMin={me?.capacity_target_min ?? DEFAULT_CAPACITY_MIN}
          />
        )}
      </div>
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
            emptyTitle="Tu día está en blanco"
            emptyHint="Elegí unas pocas cosas para hoy y planificá con calma."
            emptyIcon={Sparkles}
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
