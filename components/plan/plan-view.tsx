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
import { useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import { useBlocksForDate } from "@/lib/queries/task-blocks";
import { rolloverIncomplete, useDailyNote, useUpsertDailyNote } from "@/lib/queries/daily-notes";
import { ensureDayMaterialized } from "@/lib/queries/routines";
import type { Channel, DailyNote, Task, TaskBlock } from "@/lib/queries/types";
import { addDays, fullDayLabel, todayISO } from "@/lib/date";
import { formatMinutes, TIME_ESTIMATES } from "@/lib/format";
import { orderForAppend } from "@/lib/ordering";
import { cn } from "@/lib/utils";
import { capacityState, clampCapacity, resolveCapacity } from "@/lib/capacity";
import { scheduledMin } from "@/lib/scheduling";
import { blockEndMin } from "@/components/day/use-agenda-scheduling";
import { PastDayNotice } from "@/components/day/past-day-notice";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";
import { Button, SkeletonList } from "@/components/ui";

/** Where the projection starts when the day has no blocks and hasn't begun. */
const DAY_START_MIN = 9 * 60;

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
  const blocksQ = useBlocksForDate(date);
  const channelsQ = useChannelLookup();
  const me = useMe().data;
  const noteQ = useDailyNote(date);

  if (tasksQ.isLoading || noteQ.isLoading || !me) {
    return (
      <div className="max-w-3xl py-10">
        <SkeletonList count={3} />
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
      blocksByTask={blocksQ.data ?? new Map()}
      channelsById={channelsQ.data ?? EMPTY_CHANNEL_MAP}
      note={noteQ.data ?? null}
      capacityTarget={resolveCapacity(noteQ.data?.capacity_min, me.capacity_target_min)}
    />
  );
}

/**
 * The morning plan, as two columns: the decisions on the left, their
 * consequence on the right.
 *
 * The old page was a stack of five cards where the capacity bar scrolled away
 * the moment you started pulling work in — so you made every choice blind to
 * its cost. Here the budget, the category split and the CTA are one sticky
 * panel: you watch the day fill as you fill it.
 */
function PlanForm({
  date,
  mine,
  yesterdayPending,
  backlog,
  blocksByTask,
  channelsById,
  note,
  capacityTarget,
}: {
  date: string;
  mine: Task[];
  yesterdayPending: Task[];
  backlog: Task[];
  blocksByTask: Map<string, TaskBlock[]>;
  channelsById: Map<string, Channel>;
  note: DailyNote | null;
  capacityTarget: number;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const upsert = useUpsertDailyNote(date);
  const move = useMoveTaskToDate();

  const [intention, setIntention] = useState(note?.intention ?? "");
  const [rolledCount, setRolledCount] = useState<number | null>(null);
  const [source, setSource] = useState<"yesterday" | "backlog">(
    yesterdayPending.length > 0 ? "yesterday" : "backlog",
  );

  const plannedMin = useMemo(
    () => mine.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0),
    [mine],
  );
  // Split the budget by whether the work has a place in the day yet.
  const bookedMin = useMemo(
    () => mine.reduce((s, t) => s + scheduledMin(blocksByTask.get(t.id) ?? []), 0),
    [mine, blocksByTask],
  );
  const looseMin = Math.max(0, plannedMin - bookedMin);
  const finishMin = useMemo(
    () => projectedFinishMin(mine, blocksByTask, looseMin),
    [mine, blocksByTask, looseMin],
  );
  const byCategory = useMemo(() => categoryBreakdown(mine, channelsById), [mine, channelsById]);

  const yesterday = addDays(date, -1);
  const alreadyPlanned = !!note?.plan_completed_at;
  // Pulling work *into* a day that's already past just re-strands it somewhere
  // Hoy never looks. Reviewing an old plan is fine; feeding it isn't.
  const isPast = date < todayISO();
  const pullable = source === "yesterday" ? yesterdayPending : backlog;

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
    <div className="flex max-w-5xl flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-7">
      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Sun className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-fg">Planificá tu día</h1>
            <p className="truncate text-sm text-muted">{fullDayLabel(date)}</p>
          </div>
        </header>

        <PastDayNotice date={date}>
          Estás planificando <span className="font-semibold">{fullDayLabel(date)}</span>, que ya
          pasó. Podés mirarlo, pero traer tareas acá las deja fuera de Hoy.
        </PastDayNotice>

        {/* Focus. Once it says something it stops looking like an empty field
            and starts looking like a commitment. */}
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-bold text-fg">Foco del día</h2>
          <textarea
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            onBlur={() => upsert.mutate({ intention: intention || null })}
            placeholder="Una intención para el día: en qué querés avanzar de verdad…"
            rows={2}
            className={cn(
              "w-full resize-none rounded-card border px-3 py-2.5 text-sm text-fg placeholder:text-subtle outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
              intention.trim()
                ? "border-primary bg-primary-soft"
                : "border-border bg-surface shadow-soft",
            )}
          />
        </section>

        {/* One place to pull from, with the counts on the tabs — two separate
            cards made you scroll past the second one every morning. */}
        {!isPast && (yesterdayPending.length > 0 || backlog.length > 0) && (
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-fg">Para traer</h2>
              <div className="ml-auto flex gap-0.5 rounded-pill bg-surface-2 p-0.5">
                <SourceTab
                  label="Ayer"
                  count={yesterdayPending.length}
                  active={source === "yesterday"}
                  onClick={() => setSource("yesterday")}
                />
                <SourceTab
                  label="Backlog"
                  count={backlog.length}
                  active={source === "backlog"}
                  onClick={() => setSource("backlog")}
                />
              </div>
            </div>

            {source === "yesterday" && yesterdayPending.length > 0 && (
              <div className="flex justify-end">
                {rolledCount === null ? (
                  <button
                    onClick={pullAllFromYesterday}
                    className="cursor-pointer text-xs font-semibold text-primary hover:underline"
                  >
                    Traer las {yesterdayPending.length}
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-success">Listo</span>
                )}
              </div>
            )}

            <ul className="flex flex-col gap-1.5">
              {pullable.slice(0, 8).map((t) => (
                <PullRow
                  key={t.id}
                  task={t}
                  channel={t.channel_id ? channelsById.get(t.channel_id) : undefined}
                  onPull={() => pullToToday(t)}
                />
              ))}
              {pullable.length === 0 && (
                <li className="rounded-card border border-dashed border-border px-3 py-4 text-center text-xs text-subtle">
                  {source === "yesterday" ? "Ayer no quedó nada." : "El backlog está limpio."}
                </li>
              )}
            </ul>
          </section>
        )}

        {/* The day itself — this is where estimates get filled in. */}
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-bold text-fg">
            Tu día · {mine.length} {mine.length === 1 ? "tarea" : "tareas"}
          </h2>
          {mine.length === 0 ? (
            <p className="rounded-card border border-dashed border-border px-3 py-5 text-center text-sm text-muted">
              Todavía no elegiste nada. Traé algo de arriba o agregá tareas en la vista del día.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {mine.map((t) => (
                <PlanTaskRow
                  key={t.id}
                  task={t}
                  channel={t.channel_id ? channelsById.get(t.channel_id) : undefined}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* The consequence panel. Sticky on desktop so it's never off-screen
          while you're deciding. */}
      <aside className="flex flex-col gap-3 lg:sticky lg:top-6">
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <CapacityDial
            plannedMin={plannedMin}
            targetMin={capacityTarget}
            onTargetChange={(capacity_min) => upsert.mutate({ capacity_min })}
          />
          <dl className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
            <Stat label="Agendado" value={formatMinutes(bookedMin)} />
            <Stat label="Sin hora" value={looseMin > 0 ? formatMinutes(looseMin) : "—"} />
            <Stat
              label="Terminarías"
              value={finishMin == null ? "—" : minutesAsClock(finishMin)}
              strong
            />
          </dl>
        </section>

        {byCategory.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
            <h2 className="text-xs font-bold text-fg">Reparto por categoría</h2>
            <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-pill bg-surface-2">
              {byCategory.map((c) => (
                <span
                  key={c.id}
                  style={{ width: `${(c.minutes / plannedMin) * 100}%`, background: c.color }}
                  title={`${c.name}: ${formatMinutes(c.minutes)}`}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {byCategory.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: c.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-muted">{c.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-fg">
                    {formatMinutes(c.minutes)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Button size="lg" onClick={startDay} className="w-full">
          {alreadyPlanned ? "Guardar y empezar" : "Empezar el día"}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </aside>
    </div>
  );
}

/** The headline number: how much day you've committed, against how much there is. */
function CapacityDial({
  plannedMin,
  targetMin,
  onTargetChange,
}: {
  plannedMin: number;
  targetMin: number;
  onTargetChange: (min: number) => void;
}) {
  const { pct, over, near, overByMin } = capacityState(plannedMin, targetMin);
  const targetPct = over ? (targetMin / plannedMin) * 100 : 100;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-3xl font-extrabold tabular-nums",
            over ? "text-danger" : near ? "text-warning" : "text-fg",
          )}
        >
          {formatMinutes(plannedMin)}
        </span>
        <span className="text-sm text-muted">de {formatMinutes(targetMin)}</span>
        {over && (
          <span className="ml-auto rounded-pill bg-danger/12 px-1.5 py-0.5 text-2xs font-bold tabular-nums text-danger">
            +{formatMinutes(overByMin)}
          </span>
        )}
      </div>

      <div className="relative mt-2.5 h-2.5 rounded-pill bg-surface-2">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-pill",
            over ? "rounded-r-none bg-primary" : near ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${over ? targetPct : pct}%` }}
        />
        {over && (
          <>
            <div
              className="absolute inset-y-0 rounded-r-pill"
              style={{
                left: `${targetPct}%`,
                width: `${100 - targetPct}%`,
                background:
                  "repeating-linear-gradient(115deg, var(--danger) 0 4px, color-mix(in srgb, var(--danger) 55%, var(--surface)) 4px 8px)",
              }}
            />
            <span
              className="absolute -top-[3px] -bottom-[3px] w-[2px] bg-fg/55"
              style={{ left: `${targetPct}%` }}
              aria-hidden
            />
          </>
        )}
      </div>

      <div className="mt-2 flex gap-1.5">
        {[-30, 30].map((delta) => (
          <button
            key={delta}
            onClick={() => onTargetChange(clampCapacity(targetMin + delta))}
            className="cursor-pointer rounded-pill bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-muted transition-colors hover:bg-border hover:text-fg"
          >
            {delta > 0 ? `+${delta}m` : `${delta}m`} de capacidad
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn("tabular-nums", strong ? "font-bold text-accent" : "font-semibold text-fg")}
      >
        {value}
      </dd>
    </div>
  );
}

function SourceTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "cursor-pointer rounded-pill px-2.5 py-1 text-xs font-semibold transition-colors",
        active ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
      )}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

/** A pullable task (from yesterday or backlog): rail + title + "+ Hoy". */
function PullRow({ task, channel, onPull }: { task: Task; channel?: Channel; onPull: () => void }) {
  return (
    <li className="relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-surface py-2 pr-2 pl-3.5">
      <span
        className={cn("absolute inset-y-0 left-0 w-[3px]", !channel && "bg-border")}
        style={channel ? { background: channel.color } : undefined}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{task.title}</span>
      {task.time_estimate_min ? (
        <span className="shrink-0 text-2xs font-semibold tabular-nums text-muted">
          {formatMinutes(task.time_estimate_min)}
        </span>
      ) : null}
      <button
        onClick={onPull}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-pill bg-primary/12 px-2.5 py-1 text-2xs font-bold text-primary transition-colors hover:bg-primary hover:text-on-primary"
      >
        <Plus className="h-3 w-3" aria-hidden />
        Hoy
      </button>
    </li>
  );
}

/** A task in today's plan, with the estimate chip that makes the panel move. */
function PlanTaskRow({ task, channel }: { task: Task; channel?: Channel }) {
  const toggle = useToggleTask();
  const update = useUpdateTask();
  const done = task.status === "done";

  function cycleEstimate() {
    const cur = task.time_estimate_min;
    const idx = cur ? TIME_ESTIMATES.indexOf(cur) : -1;
    const next =
      idx === -1
        ? TIME_ESTIMATES[0]
        : idx >= TIME_ESTIMATES.length - 1
          ? null
          : TIME_ESTIMATES[idx + 1];
    update.mutate({ task, patch: { time_estimate_min: next } });
  }

  return (
    <li className="relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-surface py-2 pr-2.5 pl-3.5 shadow-soft">
      <span
        className={cn("absolute inset-y-0 left-0 w-[3px]", !channel && "bg-border")}
        style={channel ? { background: channel.color } : undefined}
        aria-hidden
      />
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
          "shrink-0 cursor-pointer rounded-pill px-2 py-0.5 text-2xs font-semibold tabular-nums transition-colors",
          task.time_estimate_min
            ? "bg-surface-2 text-muted hover:bg-border"
            : "border border-dashed border-border-strong text-subtle hover:text-muted",
        )}
      >
        {task.time_estimate_min ? formatMinutes(task.time_estimate_min) : "+ tiempo"}
      </button>
    </li>
  );
}

/**
 * When the day would end if you did the loose work right after the last thing
 * you've already placed. Null when there's nothing to project.
 *
 * Deliberately naive — it assumes you work straight through. The number is
 * useful as a smell test ("21:30?!"), not as a promise.
 */
function projectedFinishMin(
  tasks: readonly Task[],
  blocksByTask: Map<string, TaskBlock[]>,
  looseMin: number,
): number | null {
  let lastEnd: number | null = null;
  for (const t of tasks) {
    for (const b of blocksByTask.get(t.id) ?? []) {
      const end = blockEndMin(b);
      if (lastEnd == null || end > lastEnd) lastEnd = end;
    }
  }
  if (lastEnd == null && looseMin === 0) return null;
  return (lastEnd ?? DAY_START_MIN) + looseMin;
}

/** Minutes from midnight as "18:30"; past midnight it wraps and says so. */
function minutesAsClock(min: number): string {
  const wrapped = min % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return min >= 24 * 60 ? `${label} (+1d)` : label;
}

/** Planned minutes per category, biggest first. Uncategorised work is folded
 *  into one "Sin categoría" bucket rather than dropped — it's still your day. */
function categoryBreakdown(
  tasks: readonly Task[],
  channelsById: Map<string, Channel>,
): { id: string; name: string; color: string; minutes: number }[] {
  const totals = new Map<string, { name: string; color: string; minutes: number }>();
  for (const t of tasks) {
    const minutes = t.time_estimate_min ?? 0;
    if (minutes === 0) continue;
    const channel = t.channel_id ? channelsById.get(t.channel_id) : undefined;
    const id = channel?.id ?? "none";
    const entry = totals.get(id) ?? {
      name: channel?.name ?? "Sin categoría",
      color: channel?.color ?? "var(--color-border-strong)",
      minutes: 0,
    };
    entry.minutes += minutes;
    totals.set(id, entry);
  }
  return [...totals.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.minutes - a.minutes);
}
