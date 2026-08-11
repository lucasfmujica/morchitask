"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Flame, MoveRight, Quote, Target } from "lucide-react";
import { taskKeys, useTasksForDate } from "@/lib/queries/tasks";
import { useMe } from "@/lib/queries/profiles";
import { useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import {
  rolloverIncomplete,
  useDailyNote,
  useShutdownStreak,
  useUpsertDailyNote,
} from "@/lib/queries/daily-notes";
import type { Channel, DailyNote, Task } from "@/lib/queries/types";
import { carryOverTarget, fullDayLabel, relativeLabel, todayISO } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import { accuracyLabel, MOODS, shutdownSummary } from "@/lib/shutdown";
import { cn } from "@/lib/utils";
import { Confetti } from "@/components/ui/confetti";
import { SkeletonList } from "@/components/ui";
import { TaskReactions } from "@/components/tasks/task-reactions";
import { PastDayNotice } from "@/components/day/past-day-notice";

const STEPS = ["Celebrá", "Reflexioná", "Mañana"] as const;

export function ShutdownView({ date }: { date: string }) {
  const tasksQ = useTasksForDate(date);
  const me = useMe().data;
  const noteQ = useDailyNote(date);

  if (tasksQ.isLoading || noteQ.isLoading || !me) {
    return (
      <div className="mx-auto w-full max-w-xl py-10">
        <SkeletonList count={3} />
      </div>
    );
  }

  return (
    <ShutdownRitual
      key={date}
      date={date}
      tasks={tasksQ.data ?? []}
      meId={me.id}
      note={noteQ.data ?? null}
    />
  );
}

/**
 * The end-of-day ritual, in three steps: celebrate what happened, reflect on
 * it, then hand what's left forward (see `carryOverTarget` — closing an old day
 * carries to today, not to another past day).
 *
 * Form state lives here and the steps are presentational, so moving back and
 * forth never loses what you typed.
 */
function ShutdownRitual({
  date,
  tasks,
  meId,
  note,
}: {
  date: string;
  tasks: Task[];
  meId: string;
  note: DailyNote | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const upsert = useUpsertDailyNote(date);
  const streak = useShutdownStreak(todayISO());
  const channelsById = useChannelLookup().data ?? EMPTY_CHANNEL_MAP;

  const [step, setStep] = useState(0);
  const [reflection, setReflection] = useState(note?.reflection ?? "");
  const [mood, setMood] = useState<number | null>(note?.mood ?? null);
  const [rolledCount, setRolledCount] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const { done, pending, estimatedMin, actualMin, accuracy } = shutdownSummary(tasks, meId);
  // Not always `date + 1`: closing an old day carries its leftovers to today,
  // never to another past day where they'd strand out of sight.
  const tomorrow = carryOverTarget(date);
  const alreadyClosed = !!note?.shutdown_completed_at;

  async function rollover() {
    const n = await rolloverIncomplete(date, tomorrow);
    setRolledCount(n);
    qc.invalidateQueries({ queryKey: taskKeys.date(date) });
    qc.invalidateQueries({ queryKey: taskKeys.date(tomorrow) });
  }

  async function closeDay() {
    setSaveError(false);
    try {
      // Await before navigating. The old version fired the mutation and pushed
      // in the same breath, so a failure silently ate the reflection.
      await upsert.mutateAsync({
        reflection: reflection || null,
        mood,
        shutdown_completed_at: new Date().toISOString(),
      });
    } catch {
      setSaveError(true);
      return;
    }
    // The reward lands on the ACT of closing — it used to fire on arrival, so
    // it was spent before you'd done anything.
    setCelebrate(true);
    setTimeout(() => router.push(`/day/${tomorrow}`), 900);
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 py-2">
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}

      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-fg">Cerrar el día</h1>
            <p className="text-sm text-muted">{fullDayLabel(date)}</p>
          </div>
          {streak > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent"
              title={`Cerraste el día ${streak} ${streak === 1 ? "día" : "días"} seguidos`}
            >
              <Flame className="h-4 w-4" aria-hidden />
              {streak}
            </span>
          )}
        </div>
        <StepBar step={step} onJump={setStep} />
      </header>

      <PastDayNotice date={date}>
        Estás cerrando <span className="font-semibold">{fullDayLabel(date)}</span>, que ya pasó. Lo
        que te haya quedado pendiente viaja a hoy.
      </PastDayNotice>

      {step === 0 && (
        <StepCelebrate
          done={done}
          total={done.length + pending.length}
          estimatedMin={estimatedMin}
          actualMin={actualMin}
          accuracy={accuracy}
          intention={note?.intention ?? null}
          channelsById={channelsById}
        />
      )}
      {step === 1 && (
        <StepReflect
          mood={mood}
          onMood={setMood}
          reflection={reflection}
          onReflection={setReflection}
        />
      )}
      {step === 2 && (
        <StepTomorrow
          pending={pending}
          tomorrow={tomorrow}
          rolledCount={rolledCount}
          onRollover={rollover}
        />
      )}

      <div className="flex items-center gap-3 pb-safe">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Atrás
          </button>
        )}
        <button
          onClick={() => (isLast ? closeDay() : setStep(step + 1))}
          disabled={upsert.isPending}
          className="ml-auto inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none disabled:opacity-60"
        >
          {isLast ? (alreadyClosed ? "Guardar y ver mañana" : "Cerrar el día") : "Seguir"}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {saveError && (
        <p className="text-right text-sm text-danger">
          No se pudo guardar. Probá de nuevo — tu reflexión sigue acá.
        </p>
      )}
    </div>
  );
}

function StepBar({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 items-center gap-1.5">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => onJump(i)}
            aria-label={`Paso ${i + 1}: ${label}`}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "h-1.5 flex-1 cursor-pointer rounded-pill transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
              i <= step ? "bg-primary" : "bg-surface-2",
            )}
          />
        ))}
      </div>
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-subtle">
        {step + 1} de {STEPS.length} · {STEPS[step]}
      </span>
    </div>
  );
}

/** Step 1 — what actually happened. The old screen showed this as a bare count
 *  and led with what you DIDN'T do; here the finished work is the headline. */
function StepCelebrate({
  done,
  total,
  estimatedMin,
  actualMin,
  accuracy,
  intention,
  channelsById,
}: {
  done: Task[];
  total: number;
  estimatedMin: number;
  actualMin: number;
  accuracy: number | null;
  intention: string | null;
  channelsById: Map<string, Channel>;
}) {
  const accuracyText = accuracyLabel(accuracy);
  const sharedDone = done.filter((t) => t.shared);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-fg">
          {done.length === 0
            ? "Hoy no cerraste nada, y está bien"
            : `Hiciste ${done.length} ${done.length === 1 ? "cosa" : "cosas"} hoy`}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {done.length === 0
            ? "Hay días así. Lo que quedó pendiente pasa a mañana en el último paso."
            : `De ${total} que te habías propuesto.`}
        </p>
      </div>

      {done.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/60 rounded-card border border-border bg-surface px-4 shadow-soft">
          {done.map((t) => {
            const channel = t.channel_id ? channelsById.get(t.channel_id) : undefined;
            return (
              <li key={t.id} className="flex items-center gap-2.5 py-2.5">
                <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                {channel && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: channel.color }}
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{t.title}</span>
                {t.actual_time_min ? (
                  <span className="shrink-0 text-2xs tabular-nums text-muted">
                    {formatMinutes(t.actual_time_min)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Estimated vs actual — the loop that makes you better at planning, and
          the number the old screen threw away by summing estimates instead. */}
      {(estimatedMin > 0 || actualMin > 0) && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-card border border-border bg-surface p-4 shadow-soft">
          <span className="text-sm text-muted">
            Estimaste{" "}
            <strong className="font-semibold text-fg">{formatMinutes(estimatedMin)}</strong>
          </span>
          <span className="text-sm text-muted">
            Trabajaste <strong className="font-semibold text-fg">{formatMinutes(actualMin)}</strong>
          </span>
          {accuracyText && <span className="w-full text-2xs text-subtle">{accuracyText}</span>}
        </div>
      )}

      {/* The morning's intention, closing the loop it opened in /plan. */}
      {intention && (
        <div className="flex gap-3 rounded-card border border-border bg-surface-2/60 p-4">
          <Quote className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
              Tu intención de esta mañana
            </p>
            <p className="mt-1 text-sm text-fg">{intention}</p>
          </div>
        </div>
      )}

      {sharedDone.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
            Compartidas — dejale un mimo
          </p>
          {sharedDone.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-soft"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{t.title}</span>
              <TaskReactions taskId={t.id} size="sm" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Step 2 — mood and a note. Words instead of bare 1–5: "3" tells you nothing
 *  when you read it back a month later. Stored as the same 1–5, no migration. */
function StepReflect({
  mood,
  onMood,
  reflection,
  onReflection,
}: {
  mood: number | null;
  onMood: (m: number) => void;
  reflection: string;
  onReflection: (r: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-fg">¿Cómo estuvo el día?</h2>
        <p className="mt-1 text-sm text-muted">Treinta segundos, para vos.</p>
      </div>

      <div className="flex gap-2">
        {MOODS.map((m) => (
          <button
            key={m.value}
            onClick={() => onMood(m.value)}
            aria-pressed={mood === m.value}
            aria-label={m.label}
            className={cn(
              "flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-card border px-1 py-3 transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
              mood === m.value
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-surface text-muted hover:bg-surface-2",
            )}
          >
            <span className="text-xl leading-none" aria-hidden>
              {m.emoji}
            </span>
            <span className="text-2xs font-semibold">{m.label}</span>
          </button>
        ))}
      </div>

      <textarea
        value={reflection}
        onChange={(e) => onReflection(e.target.value)}
        placeholder="Qué salió bien, qué te trabó, qué querés cambiar mañana…"
        rows={5}
        className="w-full resize-none rounded-card border border-border bg-surface px-3.5 py-3 text-sm text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
    </div>
  );
}

/** Step 3 — hand what's left to tomorrow, then close. */
function StepTomorrow({
  pending,
  tomorrow,
  rolledCount,
  onRollover,
}: {
  pending: Task[];
  tomorrow: string;
  rolledCount: number | null;
  onRollover: () => void;
}) {
  const SHOWN = 6;
  // Closing an old day carries its leftovers to today, not to "mañana" — so the
  // copy has to name the day it's actually moving them to.
  const target = relativeLabel(tomorrow, todayISO()).toLowerCase();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-fg">
          {target === "hoy" ? "Traé lo pendiente a hoy" : "Dejá mañana listo"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {pending.length === 0
            ? "No te quedó nada colgando."
            : pending.length === 1
              ? "Te quedó 1 tarea sin terminar."
              : `Te quedaron ${pending.length} tareas sin terminar.`}
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="flex items-center gap-2 rounded-card border border-border bg-surface p-4 text-sm text-success shadow-soft">
          <Check className="h-4 w-4 shrink-0" aria-hidden /> Cerraste todo. Que descanses.
        </p>
      ) : (
        <div className="rounded-card border border-border bg-surface p-4 shadow-soft">
          <ul className="flex flex-col gap-1.5">
            {pending.slice(0, SHOWN).map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm text-fg">
                <Target className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
                <span className="min-w-0 truncate">{t.title}</span>
              </li>
            ))}
          </ul>
          {/* Say how many are hidden — the old version sliced at 6 silently. */}
          {pending.length > SHOWN && (
            <p className="mt-2 text-2xs text-subtle">y {pending.length - SHOWN} más</p>
          )}

          {rolledCount === null ? (
            <button
              onClick={onRollover}
              className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-border focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              <MoveRight className="h-4 w-4" aria-hidden />
              Mover {pending.length} a {target}
            </button>
          ) : (
            <p className="mt-4 text-sm text-success">
              Movimos {rolledCount} {rolledCount === 1 ? "tarea" : "tareas"} a {target}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
