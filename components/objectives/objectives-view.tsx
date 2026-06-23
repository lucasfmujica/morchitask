"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Plus, Target, Trash2 } from "lucide-react";
import {
  useCreateObjective,
  useDeleteObjective,
  useObjectiveProgress,
  useObjectives,
  useUpdateObjective,
} from "@/lib/queries/objectives";
import type { Objective, ObjectivePeriod } from "@/lib/queries/types";
import { addDays, addMonths, monthLabel, todayISO, weekRange, weekRangeLabel } from "@/lib/date";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Start/end calendar days for a period anchored on `today`. */
function periodRange(period: ObjectivePeriod, today: string) {
  if (period === "week") {
    const w = weekRange(today);
    return { start: w[0], end: w[6] };
  }
  const start = `${today.slice(0, 7)}-01`;
  return { start, end: addDays(addMonths(start, 1), -1) };
}

function rangeLabel(o: Objective) {
  return o.period === "month"
    ? monthLabel(o.start_date)
    : weekRangeLabel([o.start_date, o.end_date]);
}

export function ObjectivesView() {
  const objectivesQ = useObjectives();
  const progressQ = useObjectiveProgress();
  const objectives = objectivesQ.data ?? [];
  const progress = progressQ.data ?? new Map();

  const week = objectives.filter((o) => o.period === "week");
  const month = objectives.filter((o) => o.period === "month");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Target className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">Metas</h1>
          <p className="text-sm text-muted">Tus objetivos de la semana y del mes.</p>
        </div>
      </header>

      <NewObjective />

      <Group
        title="Esta semana"
        objectives={week}
        progress={progress}
        emptyHint="Sin metas para la semana todavía."
      />
      <Group
        title="Este mes"
        objectives={month}
        progress={progress}
        emptyHint="Sin metas para el mes todavía."
      />
    </div>
  );
}

function NewObjective() {
  const create = useCreateObjective();
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState<ObjectivePeriod>("week");

  function add() {
    const t = title.trim();
    if (!t) return;
    const { start, end } = periodRange(period, todayISO());
    create.mutate({ title: t, period, start_date: start, end_date: end });
    setTitle("");
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-soft sm:flex-row sm:items-center">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="Una meta concreta…"
        aria-label="Nueva meta"
        className="min-w-0 flex-1 bg-transparent px-1 text-sm text-fg placeholder:text-subtle outline-none"
      />
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-pill border border-border bg-surface-2 p-0.5">
          {(["week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={cn(
                "cursor-pointer rounded-pill px-2.5 py-1 text-xs font-medium transition-colors",
                period === p ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
              )}
            >
              {p === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
        <button
          onClick={add}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Agregar
        </button>
      </div>
    </div>
  );
}

function Group({
  title,
  objectives,
  progress,
  emptyHint,
}: {
  title: string;
  objectives: Objective[];
  progress: Map<string, { done: number; total: number }>;
  emptyHint: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h2>
      {objectives.length === 0 ? (
        <p className="px-1 text-sm text-muted">{emptyHint}</p>
      ) : (
        objectives.map((o) => (
          <ObjectiveRow key={o.id} objective={o} progress={progress.get(o.id)} />
        ))
      )}
    </section>
  );
}

function ObjectiveRow({
  objective,
  progress,
}: {
  objective: Objective;
  progress?: { done: number; total: number };
}) {
  const update = useUpdateObjective();
  const remove = useDeleteObjective();
  const done = objective.status === "done";
  const total = progress?.total ?? 0;
  const completed = progress?.done ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="group flex items-center gap-3 rounded-card border border-border bg-surface p-3.5 shadow-soft">
      <button
        onClick={() =>
          update.mutate({ id: objective.id, patch: { status: done ? "active" : "done" } })
        }
        aria-pressed={done}
        aria-label={done ? "Marcar activa" : "Marcar lograda"}
        className={cn(
          "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors",
          done
            ? "border-primary bg-primary text-on-primary"
            : "border-border text-transparent hover:border-primary",
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm font-semibold",
              done ? "text-subtle line-through" : "text-fg",
            )}
          >
            {objective.title}
          </p>
          <span className="shrink-0 text-xs text-subtle">{rangeLabel(objective)}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            />
          </div>
          <span className="shrink-0 text-xs text-muted">
            {total > 0 ? `${completed}/${total} tareas` : "sin tareas"}
          </span>
        </div>
      </div>

      <button
        onClick={() => remove.mutate(objective.id)}
        aria-label="Eliminar meta"
        className="shrink-0 cursor-pointer text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
