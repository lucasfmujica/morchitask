"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Minus, Plus } from "lucide-react";
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
import { addDays, todayISO } from "@/lib/date";
import { formatMinutes, TIME_ESTIMATES } from "@/lib/format";
import { orderForAppend } from "@/lib/ordering";
import { cn } from "@/lib/utils";
import { capacityState, clampCapacity, resolveCapacity } from "@/lib/capacity";
import { scheduledMin } from "@/lib/scheduling";
import { blockEndMin, blockStartMin, minutesToHHMM } from "@/components/day/use-agenda-scheduling";
import { PastDayNotice } from "@/components/day/past-day-notice";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";
import { PlanAiSuggest } from "@/components/plan/plan-ai-suggest";
import { Button, SkeletonList } from "@/components/ui";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

/** Where the projection starts when the day has no blocks and hasn't begun. */
const DAY_START_MIN = 9 * 60;

/** The `Well` look on a real <section>: these are page sections, not boxes. */
const WELL = "rounded-2xl bg-surface-2 p-2";

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
 * The morning plan, as two columns: the decisions on the left (focus, what to
 * pull in), their consequence on the right (budget tiles, the day, the split).
 *
 * The old page was a stack of five cards where the capacity bar scrolled away
 * the moment you started pulling work in, so you made every choice blind to
 * its cost. Side by side, the tiles sit next to the list you pull from.
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
  const labels = useDateLabels();
  const t = useTranslations("plan");
  const tcm = useTranslations("common");
  const tnav = useTranslations("nav");
  const tt = useTranslations("tasks");
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
  const noCategory = tt("noCategory");
  const byCategory = useMemo(
    () => categoryBreakdown(mine, channelsById, noCategory),
    [mine, channelsById, noCategory],
  );

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

  const startLabel = alreadyPlanned ? t("saveAndStart") : t("start");

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-3 px-2 pt-3">
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-2xs font-semibold tracking-[0.06em] text-muted uppercase">
            {labels.fullDayLabel(date)}
          </span>
          <h1 className="font-display text-[32px] leading-9 font-bold tracking-tight">
            {t("title")}
          </h1>
        </div>
        {/* The way out of the ritual sits where the eye starts. On a phone it
            moves to the foot of the page instead, where the plan ends. */}
        <Button onClick={startDay} className="hidden h-[46px] px-[22px] sm:inline-flex">
          {startLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </header>

      <PastDayNotice date={date}>
        {t.rich("pastNotice", {
          day: labels.fullDayLabel(date),
          b: (chunks) => <span className="font-semibold">{chunks}</span>,
        })}
      </PastDayNotice>

      {/* Decisions on the left, their consequence on the right. The old page
          stacked everything and the budget scrolled away while you pulled work
          in; side by side, the tiles move as you fill the day. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Focus. Once it says something it stops looking like an empty field
              and starts looking like a commitment. */}
          <section className={WELL}>
            <div className="flex flex-col gap-2 rounded-xl bg-surface p-4 shadow-soft">
              <label
                htmlFor="plan-intention"
                className="font-display text-base font-semibold text-fg"
              >
                {t("focusHeading")}
              </label>
              <textarea
                id="plan-intention"
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                onBlur={() => upsert.mutate({ intention: intention || null })}
                placeholder={t("intentionPlaceholder")}
                rows={3}
                className={cn(
                  "w-full resize-none rounded-[14px] p-3 text-sm leading-5 text-fg placeholder:text-subtle outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
                  intention.trim() ? "bg-primary-soft" : "bg-bg",
                )}
              />
            </div>
          </section>

          {/* One place to pull from, with the counts on the tabs: two separate
              cards made you scroll past the second one every morning. */}
          {!isPast && (yesterdayPending.length > 0 || backlog.length > 0) && (
            <section className={cn(WELL, "flex flex-col gap-1.5")}>
              <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-1.5">
                <h2 className="mr-auto font-display text-base font-semibold text-fg">
                  {t("pullHeading")}
                </h2>
                <div className="flex gap-0.5 rounded-pill bg-border p-[3px]">
                  <SourceTab
                    label={tcm("yesterday")}
                    count={yesterdayPending.length}
                    active={source === "yesterday"}
                    onClick={() => setSource("yesterday")}
                  />
                  <SourceTab
                    label={tnav("backlog")}
                    count={backlog.length}
                    active={source === "backlog"}
                    onClick={() => setSource("backlog")}
                  />
                </div>
              </div>

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
                  <li className="p-[18px] text-center text-[13px] text-muted">
                    {source === "yesterday" ? t("emptyYesterday") : t("emptyBacklog")}
                  </li>
                )}
              </ul>

              {/* The bulk move sits under the list it empties, as a white pill. */}
              {source === "yesterday" &&
                yesterdayPending.length > 0 &&
                (rolledCount === null ? (
                  <button
                    onClick={pullAllFromYesterday}
                    className="mt-0.5 h-[42px] cursor-pointer rounded-pill bg-surface text-sm font-semibold text-fg shadow-soft transition-shadow hover:shadow-card focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  >
                    {t("pullAll", { n: yesterdayPending.length })}
                  </button>
                ) : (
                  <span className="py-2 text-center text-xs font-semibold text-success">
                    {t("pulled")}
                  </span>
                ))}
            </section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {/* The budget as a bento row: the dial in ink, then what's placed,
              what isn't, and when that would have you finishing. */}
          <section
            aria-label={t("capacityHeading")}
            className="grid grid-cols-3 gap-2.5 sm:grid-cols-4"
          >
            <CapacityDial
              plannedMin={plannedMin}
              targetMin={capacityTarget}
              onTargetChange={(capacity_min) => upsert.mutate({ capacity_min })}
            />
            <Stat label={t("statBooked")} value={formatMinutes(bookedMin)} />
            <Stat label={t("statLoose")} value={looseMin > 0 ? formatMinutes(looseMin) : "—"} />
            <Stat
              label={t("statFinish")}
              value={finishMin == null ? "—" : minutesAsClock(finishMin)}
              warn={plannedMin > capacityTarget}
            />
          </section>

          {/* The day itself: this is where estimates get filled in. */}
          <section className={cn(WELL, "flex flex-col gap-1.5")}>
            <h2 className="px-2.5 pt-2.5 pb-1.5 font-display text-base font-semibold text-fg">
              {t("dayHeading", { n: mine.length })}
            </h2>
            {mine.length === 0 ? (
              <p className="px-3 py-5 text-center text-sm text-muted">{t("emptyDay")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {mine.map((t) => (
                  <PlanTaskRow
                    key={t.id}
                    task={t}
                    channel={t.channel_id ? channelsById.get(t.channel_id) : undefined}
                    startMin={firstStartMin(blocksByTask.get(t.id))}
                  />
                ))}
              </ul>
            )}
          </section>

          {byCategory.length > 0 && (
            <section className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-[18px]">
              <h2 className="font-display text-base font-semibold text-fg">
                {t("categoryHeading")}
              </h2>
              <div className="flex h-3.5 gap-[3px] overflow-hidden rounded-pill">
                {byCategory.map((c) => (
                  <span
                    key={c.id}
                    className="rounded-pill transition-[width] duration-500"
                    style={{ width: `${(c.minutes / plannedMin) * 100}%`, background: c.color }}
                    title={`${c.name}: ${formatMinutes(c.minutes)}`}
                  />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {byCategory.map((c) => (
                  <li key={c.id} className="flex min-w-0 items-center gap-1.5 text-xs">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: c.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate font-semibold text-fg">{c.name}</span>
                    <span className="shrink-0 font-mono font-medium tabular-nums text-muted">
                      {formatMinutes(c.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Not on the canvas: the AI proposal lives at the foot of the
              consequence column, out of the way until there's loose work. */}
          <PlanAiSuggest
            date={date}
            tasks={mine}
            blocksByTask={blocksByTask}
            capacityLeftMin={Math.max(0, capacityTarget - bookedMin)}
            endTargetMin={note?.end_target_min}
          />

          <Button size="lg" onClick={startDay} className="w-full sm:hidden">
            {startLabel}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Ring geometry, in the SVG's own units (it is scaled down to 96px). */
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The headline tile: how much day you've committed, as a ring against the
 * capacity, in ink so it anchors the row. The +/-30m nudges live under the
 * target: the canvas has no place for them, and this is where the number they
 * change is.
 */
function CapacityDial({
  plannedMin,
  targetMin,
  onTargetChange,
}: {
  plannedMin: number;
  targetMin: number;
  onTargetChange: (min: number) => void;
}) {
  const t = useTranslations("plan");
  const { over } = capacityState(plannedMin, targetMin);
  const ratio = targetMin > 0 ? plannedMin / targetMin : 0;
  const shown = Math.round(ratio * 100);

  return (
    <div className="col-span-3 flex items-center justify-center gap-4 rounded-2xl bg-fg px-2 py-3.5 text-bg sm:col-span-1 sm:flex-col sm:gap-1.5">
      <div className="relative h-24 w-24 shrink-0">
        <svg width="96" height="96" viewBox="0 0 132 132" className="-rotate-90" aria-hidden>
          <defs>
            <linearGradient id="plan-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--fit-from)" />
              <stop offset="1" stopColor="var(--primary)" />
            </linearGradient>
          </defs>
          <circle
            cx="66"
            cy="66"
            r={RING_R}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.14}
            strokeWidth="13"
          />
          <circle
            cx="66"
            cy="66"
            r={RING_R}
            fill="none"
            stroke={over ? "var(--accent)" : "url(#plan-ring)"}
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - Math.min(1, ratio))}
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        {/* Over budget the number itself says so (">100%"), not only the colour. */}
        <span className="absolute inset-0 flex items-center justify-center font-display text-xl font-bold tabular-nums">
          {shown}%
        </span>
      </div>
      <div className="flex items-center gap-1">
        <DeltaButton
          label={t("capacityDelta", { delta: "-30m" })}
          onClick={() => onTargetChange(clampCapacity(targetMin - 30))}
        >
          <Minus className="h-3 w-3" aria-hidden />
        </DeltaButton>
        <span className="text-2xs whitespace-nowrap text-bg/65 tabular-nums">
          {t("capacityOf", { target: formatMinutes(targetMin) })}
        </span>
        <DeltaButton
          label={t("capacityDelta", { delta: "+30m" })}
          onClick={() => onTargetChange(clampCapacity(targetMin + 30))}
        >
          <Plus className="h-3 w-3" aria-hidden />
        </DeltaButton>
      </div>
    </div>
  );
}

function DeltaButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-pill text-bg/65 transition-colors hover:bg-bg/15 hover:text-bg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-1 rounded-2xl bg-surface-2 px-3.5 py-4">
      <span className="truncate text-xs text-muted">{label}</span>
      <span
        className={cn(
          "font-display text-2xl leading-7 font-bold tracking-tight tabular-nums",
          warn ? "text-accent" : "text-fg",
        )}
      >
        {value}
      </span>
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
        "h-[30px] cursor-pointer rounded-pill px-3 text-xs font-semibold transition-colors",
        active ? "bg-surface text-fg" : "text-muted hover:text-fg",
      )}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

/** The category as a small square, the same mark the month grid uses. */
function CategoryMark({ channel }: { channel?: Channel }) {
  return (
    <span
      className={cn("h-1.5 w-1.5 shrink-0 rounded-[2px]", !channel && "bg-border-strong")}
      style={channel ? { background: channel.color } : undefined}
      aria-hidden
    />
  );
}

/** A pullable task (from yesterday or backlog): mark + title + "+ Hoy". */
function PullRow({ task, channel, onPull }: { task: Task; channel?: Channel; onPull: () => void }) {
  const t = useTranslations("plan");
  return (
    <li className="flex items-center gap-2.5 rounded-xl bg-surface py-2.5 pr-2.5 pl-3.5 shadow-soft">
      <CategoryMark channel={channel} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
        {task.title}
      </span>
      {task.time_estimate_min ? (
        <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-muted">
          {formatMinutes(task.time_estimate_min)}
        </span>
      ) : null}
      <button
        onClick={onPull}
        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-pill bg-surface-2 px-3 text-xs font-semibold text-fg transition-colors hover:bg-primary-soft hover:text-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        <Plus className="h-3 w-3" aria-hidden />
        {t("pullToToday")}
      </button>
    </li>
  );
}

/**
 * A task in today's plan: when it starts (if it has a place yet) and the
 * estimate, which cycles on click and makes the tiles above move.
 */
function PlanTaskRow({
  task,
  channel,
  startMin,
}: {
  task: Task;
  channel?: Channel;
  startMin: number | null;
}) {
  const t = useTranslations("plan");
  const tt = useTranslations("tasks");
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
    <li className="flex items-center gap-2.5 rounded-xl bg-surface py-2.5 pr-2.5 pl-3.5 shadow-soft">
      {/* Not on the canvas, kept: ticking off something already done is part
          of looking at the day in the morning. */}
      <TaskCheckbox checked={done} onToggle={() => toggle.mutate(task)} size="sm" />
      <CategoryMark channel={channel} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[13px] font-semibold",
          done ? "text-subtle line-through" : "text-fg",
        )}
      >
        {task.title}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-pill px-2 py-[3px] font-mono text-[11px] font-medium tabular-nums",
          startMin != null ? "bg-primary-soft text-fg" : "bg-surface-2 text-muted",
        )}
      >
        {startMin != null ? minutesToHHMM(startMin) : t("noTime")}
      </span>
      <button
        onClick={cycleEstimate}
        aria-label={tt("estimate")}
        className={cn(
          "min-w-10 shrink-0 cursor-pointer rounded-pill px-1.5 py-0.5 text-right font-mono text-xs font-medium tabular-nums transition-colors",
          task.time_estimate_min
            ? "text-muted hover:bg-surface-2 hover:text-fg"
            : "border border-dashed border-border-strong text-subtle hover:text-muted",
        )}
      >
        {task.time_estimate_min ? formatMinutes(task.time_estimate_min) : tt("addTime")}
      </button>
    </li>
  );
}

/** Where a task's first block starts, in minutes from midnight; null if unplaced. */
function firstStartMin(blocks: readonly TaskBlock[] | undefined): number | null {
  if (!blocks || blocks.length === 0) return null;
  return Math.min(...blocks.map(blockStartMin));
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
 *  into one bucket rather than dropped — it's still your day. That bucket's
 *  name arrives as an argument: this is a plain function, not a component, so
 *  it has no translator of its own. */
function categoryBreakdown(
  tasks: readonly Task[],
  channelsById: Map<string, Channel>,
  noCategoryName: string,
): { id: string; name: string; color: string; minutes: number }[] {
  const totals = new Map<string, { name: string; color: string; minutes: number }>();
  for (const t of tasks) {
    const minutes = t.time_estimate_min ?? 0;
    if (minutes === 0) continue;
    const channel = t.channel_id ? channelsById.get(t.channel_id) : undefined;
    const id = channel?.id ?? "none";
    const entry = totals.get(id) ?? {
      name: channel?.name ?? noCategoryName,
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
