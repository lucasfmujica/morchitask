"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Moon, MoveRight } from "lucide-react";
import { taskKeys, useTasksForDate } from "@/lib/queries/tasks";
import { useMe } from "@/lib/queries/profiles";
import { rolloverIncomplete, useDailyNote, useUpsertDailyNote } from "@/lib/queries/daily-notes";
import type { DailyNote, Task } from "@/lib/queries/types";
import { addDays, fullDayLabel, relativeLabel, todayISO } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ShutdownView({ date }: { date: string }) {
  const tasksQ = useTasksForDate(date);
  const me = useMe().data;
  const noteQ = useDailyNote(date);

  if (tasksQ.isLoading || noteQ.isLoading || !me) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="h-40 animate-pulse rounded-card bg-surface-2" />
      </div>
    );
  }

  const mine = (tasksQ.data ?? []).filter((t) => t.owner_id === me.id);
  return <ShutdownForm key={date} date={date} mine={mine} note={noteQ.data ?? null} />;
}

function ShutdownForm({
  date,
  mine,
  note,
}: {
  date: string;
  mine: Task[];
  note: DailyNote | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const upsert = useUpsertDailyNote(date);

  const [reflection, setReflection] = useState(note?.reflection ?? "");
  const [mood, setMood] = useState<number | null>(note?.mood ?? null);
  const [rolledCount, setRolledCount] = useState<number | null>(null);

  const pending = mine.filter((t) => t.status === "todo");
  const done = mine.filter((t) => t.status === "done");
  const doneMin = done.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0);
  const tomorrow = addDays(date, 1);
  const alreadyClosed = !!note?.shutdown_completed_at;

  async function rollover() {
    const n = await rolloverIncomplete(date, tomorrow);
    setRolledCount(n);
    qc.invalidateQueries({ queryKey: taskKeys.date(date) });
    qc.invalidateQueries({ queryKey: taskKeys.date(tomorrow) });
  }

  function closeDay() {
    upsert.mutate({
      reflection: reflection || null,
      mood,
      shutdown_completed_at: new Date().toISOString(),
    });
    router.push(`/day/${tomorrow}`);
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Moon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">Cierre del día</h1>
          <p className="text-sm text-muted">{fullDayLabel(date)}</p>
        </div>
      </header>

      {/* Summary */}
      <section className="grid grid-cols-2 gap-3">
        <Stat label="Completadas" value={`${done.length}`} sub={`de ${mine.length}`} />
        <Stat
          label="Tiempo hecho"
          value={doneMin > 0 ? formatMinutes(doneMin) : "—"}
          sub="estimado"
        />
      </section>

      {/* Pending → tomorrow */}
      <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
        <h2 className="font-semibold text-fg">Pendientes</h2>
        {pending.length === 0 ? (
          <p className="mt-1 flex items-center gap-2 text-sm text-success">
            <Check className="h-4 w-4" aria-hidden /> ¡Cerraste todo! Buen día.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              Te quedaron {pending.length} {pending.length === 1 ? "tarea" : "tareas"} sin terminar.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {pending.slice(0, 6).map((t) => (
                <li key={t.id} className="truncate text-sm text-fg">
                  • {t.title}
                </li>
              ))}
            </ul>
            {rolledCount === null ? (
              <button
                onClick={rollover}
                className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-border"
              >
                <MoveRight className="h-4 w-4" aria-hidden />
                Mover {pending.length} a mañana
              </button>
            ) : (
              <p className="mt-3 text-sm text-success">
                Movimos {rolledCount} {rolledCount === 1 ? "tarea" : "tareas"} a{" "}
                {relativeLabel(tomorrow, todayISO()).toLowerCase()}.
              </p>
            )}
          </>
        )}
      </section>

      {/* Reflection */}
      <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-soft">
        <h2 className="font-semibold text-fg">¿Cómo estuvo el día?</h2>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setMood(n)}
              aria-pressed={mood === n}
              aria-label={`Ánimo ${n} de 5`}
              className={cn(
                "h-9 w-9 cursor-pointer rounded-full text-sm font-semibold transition-colors",
                mood === n
                  ? "bg-primary text-on-primary"
                  : "bg-surface-2 text-muted hover:bg-border",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="Una nota para vos: qué salió bien, qué mejorar…"
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </section>

      <button
        onClick={closeDay}
        className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        {alreadyClosed ? "Guardar y ver mañana" : "Cerrar el día"}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-fg">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}
