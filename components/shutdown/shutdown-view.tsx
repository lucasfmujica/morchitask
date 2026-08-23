"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Flame, Quote } from "lucide-react";
import { taskKeys, useMoveTaskToDate, useTasksForDate } from "@/lib/queries/tasks";
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
import {
  accuracyLabel,
  carryDestination,
  defaultCarryPlan,
  MOODS,
  projectedTomorrowMin,
  shutdownSummary,
  splitByDestination,
  type CarryPlan,
} from "@/lib/shutdown";
import { resolveCapacity } from "@/lib/capacity";
import { orderForAppend } from "@/lib/ordering";
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
      capacityTarget={resolveCapacity(noteQ.data?.capacity_min, me.capacity_target_min)}
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
  capacityTarget,
}: {
  date: string;
  tasks: Task[];
  meId: string;
  note: DailyNote | null;
  capacityTarget: number;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const upsert = useUpsertDailyNote(date);
  const streak = useShutdownStreak(todayISO());
  const channelsById = useChannelLookup().data ?? EMPTY_CHANNEL_MAP;

  const [step, setStep] = useState(0);
  const [reflection, setReflection] = useState(note?.reflection ?? "");
  const [mood, setMood] = useState<number | null>(note?.mood ?? null);
  const [celebrate, setCelebrate] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const {
    done,
    pending: allPending,
    estimatedMin,
    actualMin,
    accuracy,
  } = shutdownSummary(tasks, meId);
  // Routine instances are excluded from the destination list: tomorrow's copy
  // materializes on its own, so "Mañana" would be a no-op — while "Backlog"
  // would quietly pull an instance out of its recurrence. Neither choice means
  // what it says, so we don't offer it. The rollover sweep skips them too.
  const pending = allPending.filter((t) => !t.template_id);
  // Not always `date + 1`: closing an old day carries its leftovers to today,
  // never to another past day where they'd strand out of sight.
  const tomorrow = carryOverTarget(date);
  const alreadyClosed = !!note?.shutdown_completed_at;
  const move = useMoveTaskToDate();
  const tomorrowTasks = useTasksForDate(tomorrow).data ?? [];
  const tomorrowPlannedMin = tomorrowTasks
    .filter((t) => t.owner_id === meId && t.status !== "done")
    .reduce((sum, t) => sum + (t.time_estimate_min ?? 0), 0);

  // Where each leftover goes. Everything rolls over unless you say otherwise —
  // moving the whole pile was the old behaviour and it quietly rebuilt an
  // over-full day every night.
  const [plan, setPlan] = useState<CarryPlan>(() => defaultCarryPlan(pending));
  const projectedMin = projectedTomorrowMin(pending, plan, tomorrowPlannedMin);

  async function applyCarryPlan() {
    const { toBacklog } = splitByDestination(pending, plan);
    // Park the ones you're not carrying first, so the sweep below only picks up
    // what's actually meant to travel.
    await Promise.all(
      toBacklog.map((task) =>
        move.mutateAsync({ task, toDate: null, sortOrder: orderForAppend([]) }),
      ),
    );
    await rolloverIncomplete(date, tomorrow);
    qc.invalidateQueries({ queryKey: taskKeys.date(date) });
    qc.invalidateQueries({ queryKey: taskKeys.date(tomorrow) });
    qc.invalidateQueries({ queryKey: taskKeys.backlog });
  }

  async function closeDay() {
    setSaveError(false);
    try {
      await applyCarryPlan();
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
          total={done.length + allPending.length}
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
          plan={plan}
          onToggle={(id) =>
            setPlan((p) => ({
              ...p,
              [id]: carryDestination(p, id) === "tomorrow" ? "backlog" : "tomorrow",
            }))
          }
          projectedMin={projectedMin}
          capacityTarget={capacityTarget}
        />
      )}

      {/* On a phone the CTA is pinned: the step content scrolls under it, so
          "Cerrar el día" is never a scroll away. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t border-border bg-bg/95 px-4 py-3 pb-safe backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
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
        <h2 className="text-xl font-extrabold tracking-tight text-fg">
          {done.length === 0
            ? "Hoy no cerraste nada, y está bien"
            : `Hiciste ${done.length} ${done.length === 1 ? "cosa" : "cosas"} hoy`}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {done.length === 0
            ? "Hay días así. Lo que quedó pendiente pasa a mañana en el último paso."
            : `De ${total} que te habías propuesto${
                actualMin > 0 ? ` · ${formatMinutes(actualMin)} medidas` : ""
              }.`}
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

      {/* Estimated vs actual, as two bars against a shared scale. Two sentences
          made you do the arithmetic; two bars make the gap the thing you see —
          which is the whole feedback loop this screen exists for. */}
      {(estimatedMin > 0 || actualMin > 0) && (
        <div className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4 shadow-soft">
          <CompareBar
            label="Estimaste"
            min={estimatedMin}
            max={Math.max(estimatedMin, actualMin)}
            tone="soft"
          />
          <CompareBar
            label="Trabajaste"
            min={actualMin}
            max={Math.max(estimatedMin, actualMin)}
            tone="solid"
          />
          {accuracyText && (
            <p className="mt-0.5 text-2xs font-semibold text-warning">{accuracyText}</p>
          )}
        </div>
      )}

      {/* The morning's intention, closing the loop it opened in /plan — with
          the day's result attached, so it reads as answered rather than filed. */}
      {intention && (
        <div className="flex gap-3 rounded-card border border-border bg-surface-2/60 p-4">
          <Quote className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
              Tu intención de esta mañana
            </p>
            <p className="mt-1 text-sm text-fg">{intention}</p>
            <p className="mt-1.5 text-2xs font-semibold text-success">
              {done.length === 0
                ? "Queda para mañana."
                : done.length === total
                  ? "Cumplida: salió todo."
                  : `Avanzaste: ${done.length} de ${total}.`}
            </p>
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

/**
 * Step 3 — decide where each leftover goes, then close.
 *
 * It used to be one "Mover N a mañana" button: all or nothing. That's how
 * tomorrow ends up pre-loaded with today's failures before you've even planned
 * it. Each task now carries its own destination, and the footer shows what
 * tomorrow would weigh once you apply them — so parking something in the
 * backlog is a visible relief rather than an admission.
 */
function StepTomorrow({
  pending,
  tomorrow,
  plan,
  onToggle,
  projectedMin,
  capacityTarget,
}: {
  pending: Task[];
  tomorrow: string;
  plan: CarryPlan;
  onToggle: (taskId: string) => void;
  projectedMin: number;
  capacityTarget: number;
}) {
  // Closing an old day carries its leftovers to today, not to "mañana" — so the
  // copy has to name the day it's actually moving them to.
  const target = relativeLabel(tomorrow, todayISO()).toLowerCase();
  const over = projectedMin > capacityTarget;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-fg">
          {target === "hoy" ? "Traé lo pendiente a hoy" : "Dejá mañana listo"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {pending.length === 0
            ? "No te quedó nada colgando."
            : pending.length === 1
              ? "Te quedó 1 tarea sin terminar. Elegí a dónde va."
              : `Te quedaron ${pending.length} tareas sin terminar. Elegí a dónde va cada una.`}
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="flex items-center gap-2 rounded-card border border-border bg-surface p-4 text-sm text-success shadow-soft">
          <Check className="h-4 w-4 shrink-0" aria-hidden /> Cerraste todo. Que descanses.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {pending.map((t) => {
              const dest = carryDestination(plan, t.id);
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-surface py-2 pr-2 pl-3 shadow-soft"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{t.title}</span>
                  {t.time_estimate_min ? (
                    <span className="shrink-0 text-2xs font-semibold tabular-nums text-muted">
                      {formatMinutes(t.time_estimate_min)}
                    </span>
                  ) : null}
                  <button
                    onClick={() => onToggle(t.id)}
                    aria-label={`Destino de ${t.title}`}
                    className={cn(
                      "w-20 shrink-0 cursor-pointer rounded-pill px-2.5 py-1 text-2xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                      dest === "tomorrow"
                        ? "bg-primary/12 text-primary"
                        : "bg-surface-2 text-muted",
                    )}
                  >
                    {dest === "tomorrow" ? (target === "hoy" ? "Hoy" : "Mañana") : "Backlog"}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* What you just decided, in minutes. */}
          <p
            className={cn(
              "rounded-card border px-4 py-3 text-sm",
              over
                ? "border-danger/30 bg-danger/5 text-danger"
                : "border-border bg-surface text-muted shadow-soft",
            )}
          >
            {target === "hoy" ? "Hoy" : "Mañana"} quedaría en{" "}
            <strong className="font-semibold">{formatMinutes(projectedMin)}</strong> de{" "}
            {formatMinutes(capacityTarget)}
            {over && " — te conviene mandar algo al backlog."}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * One bar of the estimate-vs-actual pair. Both are drawn against the SAME
 * maximum, which is the only way the comparison means anything.
 */
function CompareBar({
  label,
  min,
  max,
  tone,
}: {
  label: string;
  min: number;
  max: number;
  tone: "soft" | "solid";
}) {
  const pct = max > 0 ? (min / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular-nums text-fg">{formatMinutes(min)}</span>
      </div>
      <div className="mt-1 h-2 rounded-pill bg-surface-2">
        <div
          className={cn("h-full rounded-pill", tone === "solid" ? "bg-primary" : "bg-primary/45")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
