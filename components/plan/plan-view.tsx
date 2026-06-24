"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Sun } from "lucide-react";
import {
  taskKeys,
  useBacklogTasks,
  useMoveTaskToDate,
  useTasksForDate,
  useToggleTask,
  useUpdateTask,
} from "@/lib/queries/tasks";
import { useMe } from "@/lib/queries/profiles";
import { rolloverIncomplete, useDailyNote, useUpsertDailyNote } from "@/lib/queries/daily-notes";
import { ensureDayMaterialized } from "@/lib/queries/routines";
import type { DailyNote, Task } from "@/lib/queries/types";
import { addDays, fullDayLabel } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import { orderForAppend } from "@/lib/ordering";
import { cn } from "@/lib/utils";
import { resolveCapacity } from "@/lib/capacity";
import { CapacityBar } from "@/components/day/capacity-bar";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";

const ESTIMATES = [15, 30, 45, 60, 90];

export function PlanView({ date }: { date: string }) {
  const qc = useQueryClient();
  const yesterday = addDays(date, -1);

  // Make sure today's routine instances exist before we plan (idempotent).
  useEffect(() => {
    ensureDayMaterialized(date)
      .then(() => qc.invalidateQueries({ queryKey: taskKeys.date(date) }))
      .catch(() => {});
  }, [date, qc]);

  const tasksQ = useTasksForDate(date);
  const yesterdayQ = useTasksForDate(yesterday);
  const backlogQ = useBacklogTasks();
  const me = useMe().data;
  const noteQ = useDailyNote(date);

  if (tasksQ.isLoading || noteQ.isLoading || !me) {
    return (
      <div className="max-w-3xl py-10">
        <div className="h-40 animate-pulse rounded-card bg-surface-2" />
      </div>
    );
  }

  const mine = (tasksQ.data ?? []).filter((t) => t.owner_id === me.id);
  const yesterdayPending = (yesterdayQ.data ?? []).filter(
    (t) => t.owner_id === me.id && t.status === "todo",
  );
  const backlog = (backlogQ.data ?? []).filter((t) => t.owner_id === me.id);

  return (
    <PlanForm
      key={date}
      date={date}
      mine={mine}
      yesterdayPending={yesterdayPending}
      backlog={backlog}
      note={noteQ.data ?? null}
      capacityTarget={resolveCapacity(noteQ.data?.capacity_min, me.capacity_target_min)}
    />
  );
}

function PlanForm({
  date,
  mine,
  yesterdayPending,
  backlog,
  note,
  capacityTarget,
}: {
  date: string;
  mine: Task[];
  yesterdayPending: Task[];
  backlog: Task[];
  note: DailyNote | null;
  capacityTarget: number;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const upsert = useUpsertDailyNote(date);
  const move = useMoveTaskToDate();

  const [intention, setIntention] = useState(note?.intention ?? "");
  const [rolledCount, setRolledCount] = useState<number | null>(null);

  const plannedMin = useMemo(
    () => mine.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0),
    [mine],
  );
  const yesterday = addDays(date, -1);
  const alreadyPlanned = !!note?.plan_completed_at;

  function pullToToday(task: Task) {
    move.mutate({ task, toDate: date, sortOrder: orderForAppend(mine.map((t) => t.sort_order)) });
  }

  async function pullAllFromYesterday() {
    const n = await rolloverIncomplete(yesterday, date);
    setRolledCount(n);
    qc.invalidateQueries({ queryKey: taskKeys.date(yesterday) });
    qc.invalidateQueries({ queryKey: taskKeys.date(date) });
  }

  function startDay() {
    upsert.mutate({ intention: intention || null, plan_completed_at: new Date().toISOString() });
    router.push(`/day/${date}`);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Sun className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">Planificá tu día</h1>
          <p className="text-sm text-muted">{fullDayLabel(date)}</p>
        </div>
      </header>

      {/* Capacity */}
      <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
        <CapacityBar
          plannedMin={plannedMin}
          targetMin={capacityTarget}
          onTargetChange={(capacity_min) => upsert.mutate({ capacity_min })}
        />
      </section>

      {/* Intention */}
      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-soft">
        <h2 className="font-semibold text-fg">¿Cuál es tu foco hoy?</h2>
        <textarea
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          onBlur={() => upsert.mutate({ intention: intention || null })}
          placeholder="Una intención para el día: en qué querés avanzar de verdad…"
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </section>

      {/* Pull from yesterday */}
      {yesterdayPending.length > 0 && (
        <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-fg">Quedó de ayer</h2>
            {rolledCount === null ? (
              <button
                onClick={pullAllFromYesterday}
                className="cursor-pointer rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-border"
              >
                Traer todo
              </button>
            ) : (
              <span className="text-xs text-success">Listo</span>
            )}
          </div>
          <ul className="mt-2 flex flex-col divide-y divide-border/60">
            {yesterdayPending.map((t) => (
              <PullRow key={t.id} task={t} onPull={() => pullToToday(t)} />
            ))}
          </ul>
        </section>
      )}

      {/* Pull from backlog */}
      {backlog.length > 0 && (
        <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
          <h2 className="font-semibold text-fg">Del backlog</h2>
          <ul className="mt-2 flex flex-col divide-y divide-border/60">
            {backlog.slice(0, 8).map((t) => (
              <PullRow key={t.id} task={t} onPull={() => pullToToday(t)} />
            ))}
          </ul>
        </section>
      )}

      {/* Today's plan — set estimates */}
      <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
        <h2 className="font-semibold text-fg">Tu día</h2>
        {mine.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            Todavía no elegiste nada. Traé algo de arriba o agregá tareas en la vista del día.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border/60">
            {mine.map((t) => (
              <PlanTaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
      </section>

      <button
        onClick={startDay}
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        {alreadyPlanned ? "Guardar y empezar" : "Empezar el día"}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** A pullable task (from yesterday or backlog): title + a "+ Hoy" button. */
function PullRow({ task, onPull }: { task: Task; onPull: () => void }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{task.title}</span>
      <button
        onClick={onPull}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-primary-soft px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Hoy
      </button>
    </li>
  );
}

/** A today task with a cycling time-estimate chip (mirrors the Day card). */
function PlanTaskRow({ task }: { task: Task }) {
  const toggle = useToggleTask();
  const update = useUpdateTask();
  const done = task.status === "done";

  function cycleEstimate() {
    const cur = task.time_estimate_min;
    const idx = cur ? ESTIMATES.indexOf(cur) : -1;
    const next =
      idx === -1 ? ESTIMATES[0] : idx >= ESTIMATES.length - 1 ? null : ESTIMATES[idx + 1];
    update.mutate({ task, patch: { time_estimate_min: next } });
  }

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <TaskCheckbox checked={done} onToggle={() => toggle.mutate(task)} size="sm" />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          done ? "text-subtle line-through" : "text-fg",
        )}
      >
        {task.title}
      </span>
      <button
        onClick={cycleEstimate}
        aria-label="Estimación de tiempo"
        className={cn(
          "shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors",
          task.time_estimate_min
            ? "bg-surface-2 text-muted hover:bg-border"
            : "text-subtle hover:text-muted",
        )}
      >
        {task.time_estimate_min ? formatMinutes(task.time_estimate_min) : "+ tiempo"}
      </button>
    </li>
  );
}
