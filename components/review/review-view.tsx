"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Moon, Target, Trophy } from "lucide-react";
import {
  taskKeys,
  tasksForDateQueryOptions,
  useBacklogTasks,
  useMoveTaskToDate,
} from "@/lib/queries/tasks";
import { useMe } from "@/lib/queries/profiles";
import { useShutdownDays } from "@/lib/queries/daily-notes";
import { useUpsertWeeklyNote, useWeeklyNote } from "@/lib/queries/weekly-notes";
import { useCreateObjective, useObjectiveProgress, useObjectives } from "@/lib/queries/objectives";
import type { Objective, Task, WeeklyNote } from "@/lib/queries/types";
import { useTranslations } from "next-intl";
import { addDays, weekRange } from "@/lib/date";
import { useDateLabels } from "@/lib/use-date-labels";
import { formatMinutes } from "@/lib/format";
import { resolveCapacity } from "@/lib/capacity";
import { orderForAppend } from "@/lib/ordering";
import { projectedDayLoads, weekLeftovers, weekSummary, type WeekAssignments } from "@/lib/review";
import { cn } from "@/lib/utils";
import { Confetti } from "@/components/ui/confetti";
import { SkeletonList } from "@/components/ui";
import { CompareBar } from "@/components/shutdown/shutdown-view";

const STEPS = ["stepLookBack", "stepLeftovers", "stepNextWeek"] as const;
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function ReviewView({ week }: { week: string }) {
  const days = useMemo(() => weekRange(week, 1), [week]);
  const nextDays = useMemo(() => weekRange(addDays(week, 7), 1), [week]);
  const me = useMe().data;
  const noteQ = useWeeklyNote(week);
  const weekQs = useQueries({ queries: days.map((d) => tasksForDateQueryOptions(d)) });
  const nextQs = useQueries({ queries: nextDays.map((d) => tasksForDateQueryOptions(d)) });
  const backlogQ = useBacklogTasks();

  const loading =
    !me ||
    noteQ.isLoading ||
    backlogQ.isLoading ||
    weekQs.some((q) => q.isLoading) ||
    nextQs.some((q) => q.isLoading);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-xl py-10">
        <SkeletonList count={3} />
      </div>
    );
  }

  return (
    <WeeklyReview
      key={week}
      week={week}
      days={days}
      nextDays={nextDays}
      meId={me.id}
      capacity={resolveCapacity(null, me.capacity_target_min)}
      note={noteQ.data ?? null}
      weekTasks={weekQs.flatMap((q) => q.data ?? [])}
      nextTasksByDay={new Map(nextDays.map((d, i) => [d, nextQs[i].data ?? []]))}
      backlog={backlogQ.data ?? []}
    />
  );
}

/**
 * The weekly review, in three steps: look back at the week, decide where its
 * leftovers go, then shape the next one. Like the daily shutdown, form state
 * lives here and nothing is written until the last step — moving back and forth
 * never loses what you typed or where you placed things.
 */
function WeeklyReview({
  week,
  days,
  nextDays,
  meId,
  capacity,
  note,
  weekTasks,
  nextTasksByDay,
  backlog,
}: {
  week: string;
  days: string[];
  nextDays: string[];
  meId: string;
  capacity: number;
  note: WeeklyNote | null;
  weekTasks: Task[];
  nextTasksByDay: Map<string, Task[]>;
  backlog: Task[];
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTranslations("review");
  const ts = useTranslations("shutdown");
  const { weekRangeLabel } = useDateLabels();
  const upsert = useUpsertWeeklyNote(week);
  const move = useMoveTaskToDate();
  const closedDays = useShutdownDays(days[0], days[6]);

  const [step, setStep] = useState(0);
  const [wins, setWins] = useState(note?.wins ?? "");
  const [lessons, setLessons] = useState(note?.lessons ?? "");
  const [focus, setFocus] = useState(note?.next_focus ?? "");
  // Leftovers default to the backlog: piling a whole week's misses onto Monday
  // is how next week starts already behind. You pull back what you want.
  const [assign, setAssign] = useState<WeekAssignments>({});
  const [celebrate, setCelebrate] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);

  const summary = weekSummary(weekTasks, meId);
  const leftovers = weekLeftovers(weekTasks, meId);
  const myBacklog = backlog.filter((t) => t.owner_id === meId);

  const existingMin = new Map(
    nextDays.map((d) => [
      d,
      (nextTasksByDay.get(d) ?? [])
        .filter((t) => t.owner_id === meId && t.status !== "done")
        .reduce((sum, t) => sum + (t.time_estimate_min ?? 0), 0),
    ]),
  );
  const loads = projectedDayLoads(nextDays, existingMin, [...leftovers, ...myBacklog], assign);

  const toggleDay = (taskId: string, day: string) =>
    setAssign((a) => ({ ...a, [taskId]: a[taskId] === day ? undefined : day }));

  async function finish() {
    setSaveError(false);
    setSaving(true);
    try {
      const appended = new Map<string, number[]>(
        nextDays.map((d) => [d, (nextTasksByDay.get(d) ?? []).map((t) => t.sort_order)]),
      );
      const moves = [...leftovers, ...myBacklog].flatMap((task) => {
        const day = assign[task.id];
        if (day) {
          const orders = appended.get(day)!;
          const sortOrder = orderForAppend(orders);
          orders.push(sortOrder);
          return [move.mutateAsync({ task, toDate: day, sortOrder })];
        }
        // An unplaced leftover leaves its past day for the backlog, where it
        // stays visible — the same rule as the daily shutdown.
        if (task.planned_date !== null) {
          return [move.mutateAsync({ task, toDate: null, sortOrder: orderForAppend([]) })];
        }
        return [];
      });
      await Promise.all(moves);
      await upsert.mutateAsync({
        wins: wins || null,
        lessons: lessons || null,
        next_focus: focus || null,
        completed_at: new Date().toISOString(),
      });
    } catch {
      setSaveError(true);
      setSaving(false);
      return;
    }
    qc.invalidateQueries({ queryKey: taskKeys.backlog });
    for (const d of [...days, ...nextDays]) qc.invalidateQueries({ queryKey: taskKeys.date(d) });
    setCelebrate(true);
    setTimeout(() => router.push(`/week/${nextDays[0]}`), 900);
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 py-2">
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}

      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">{t("title")}</h1>
          <p className="text-sm text-muted">{t("weekOf", { range: weekRangeLabel(days) })}</p>
        </div>
        <StepBar step={step} onJump={setStep} />
      </header>

      {step === 0 && (
        <StepLookBack
          week={days}
          summary={summary}
          closedDays={closedDays.size}
          wins={wins}
          onWins={setWins}
          lessons={lessons}
          onLessons={setLessons}
        />
      )}
      {step === 1 && (
        <StepLeftovers
          leftovers={leftovers}
          nextDays={nextDays}
          assign={assign}
          onToggle={toggleDay}
          loads={loads}
          capacity={capacity}
        />
      )}
      {step === 2 && (
        <StepNextWeek
          nextDays={nextDays}
          focus={focus}
          onFocus={setFocus}
          backlog={myBacklog}
          assign={assign}
          onToggle={toggleDay}
          loads={loads}
          capacity={capacity}
        />
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t border-border bg-bg/95 px-4 py-3 pb-safe backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {ts("back")}
          </button>
        )}
        <button
          onClick={() => (isLast ? finish() : setStep(step + 1))}
          disabled={saving}
          className="ml-auto inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none disabled:opacity-60"
        >
          {isLast ? (note?.completed_at ? t("saveAndSee") : t("close")) : ts("next")}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {saveError && <p className="text-right text-sm text-danger">{t("saveError")}</p>}
    </div>
  );
}

function StepBar({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  const t = useTranslations("review");
  const ts = useTranslations("shutdown");
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 items-center gap-1.5">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => onJump(i)}
            aria-label={ts("stepAria", { n: i + 1, name: t(label) })}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "h-1.5 flex-1 cursor-pointer rounded-pill transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
              i <= step ? "bg-primary" : "bg-surface-2",
            )}
          />
        ))}
      </div>
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-subtle">
        {ts("stepOf", { step: step + 1, total: STEPS.length, name: t(STEPS[step]) })}
      </span>
    </div>
  );
}

/** Step 1 — the week in numbers, its goals, and two lines for you. */
function StepLookBack({
  week,
  summary,
  closedDays,
  wins,
  onWins,
  lessons,
  onLessons,
}: {
  week: string[];
  summary: ReturnType<typeof weekSummary>;
  closedDays: number;
  wins: string;
  onWins: (v: string) => void;
  lessons: string;
  onLessons: (v: string) => void;
}) {
  const { done, total, estimatedMin, actualMin, bestDay } = summary;
  const t = useTranslations("review");
  const ts = useTranslations("shutdown");
  const { fullDayLabel } = useDateLabels();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-fg">
          {done === 0 ? t("quietWeek") : t("doneCount", { n: done })}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {total === 0
            ? t("nothingPlanned")
            : actualMin > 0
              ? t("outOfPlannedMeasured", { total, time: formatMinutes(actualMin) })
              : t("outOfPlanned", { total })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat icon={Moon} label={t("closedDays")} value={t("closedDaysValue", { n: closedDays })} />
        <Stat
          icon={Trophy}
          label={t("bestDay")}
          value={bestDay ? fullDayLabel(bestDay).split(" ")[0].replace(",", "") : "—"}
        />
      </div>

      {(estimatedMin > 0 || actualMin > 0) && (
        <div className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4 shadow-soft">
          <CompareBar
            label={ts("estimatedBar")}
            min={estimatedMin}
            max={Math.max(estimatedMin, actualMin)}
            tone="soft"
          />
          <CompareBar
            label={ts("workedBar")}
            min={actualMin}
            max={Math.max(estimatedMin, actualMin)}
            tone="solid"
          />
        </div>
      )}

      <WeekGoals week={week} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-fg">{t("winsQuestion")}</span>
        <textarea
          value={wins}
          onChange={(e) => onWins(e.target.value)}
          placeholder={t("winsPlaceholder")}
          rows={3}
          className="w-full resize-none rounded-card border border-border bg-surface px-3.5 py-3 text-sm text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-fg">{t("lessonsQuestion")}</span>
        <textarea
          value={lessons}
          onChange={(e) => onLessons(e.target.value)}
          placeholder={t("lessonsPlaceholder")}
          rows={3}
          className="w-full resize-none rounded-card border border-border bg-surface px-3.5 py-3 text-sm text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </label>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Moon; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-3.5 shadow-soft">
      <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
      <span className="text-lg font-bold capitalize text-fg">{value}</span>
    </div>
  );
}

/** Weekly goals that overlap `week`, with their progress. */
function WeekGoals({ week }: { week: string[] }) {
  const t = useTranslations("review");
  const objectives = useObjectives().data ?? [];
  const progress = useObjectiveProgress().data;
  const goals = objectives.filter(
    (o) => o.period === "week" && o.start_date <= week[6] && o.end_date >= week[0],
  );
  if (goals.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">{t("yourGoals")}</p>
      <ul className="flex flex-col gap-1.5">
        {goals.map((o) => {
          const p = progress?.get(o.id);
          const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <li
              key={o.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-soft"
            >
              <Target className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{o.title}</span>
              <span
                className={cn(
                  "shrink-0 text-sm font-bold tabular-nums",
                  pct === 100 ? "text-success" : "text-muted",
                )}
              >
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Step 2 — each unfinished task gets a day next week, or goes to the backlog. */
function StepLeftovers({
  leftovers,
  nextDays,
  assign,
  onToggle,
  loads,
  capacity,
}: {
  leftovers: Task[];
  nextDays: string[];
  assign: WeekAssignments;
  onToggle: (taskId: string, day: string) => void;
  loads: Map<string, number>;
  capacity: number;
}) {
  const t = useTranslations("review");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-fg">{t("leftoversTitle")}</h2>
        <p className="mt-1 text-sm text-muted">
          {leftovers.length === 0 ? t("leftoversNone") : t("leftoversHint")}
        </p>
      </div>

      {leftovers.length === 0 ? (
        <p className="flex items-center gap-2 rounded-card border border-border bg-surface p-4 text-sm text-success shadow-soft">
          <Check className="h-4 w-4 shrink-0" aria-hidden /> {t("leftoversClean")}
        </p>
      ) : (
        <>
          <DayLoads days={nextDays} loads={loads} capacity={capacity} />
          <TaskDayList tasks={leftovers} days={nextDays} assign={assign} onToggle={onToggle} />
        </>
      )}
    </div>
  );
}

/** Step 3 — the focus for next week, its goals, and pulling from the backlog. */
function StepNextWeek({
  nextDays,
  focus,
  onFocus,
  backlog,
  assign,
  onToggle,
  loads,
  capacity,
}: {
  nextDays: string[];
  focus: string;
  onFocus: (v: string) => void;
  backlog: Task[];
  assign: WeekAssignments;
  onToggle: (taskId: string, day: string) => void;
  loads: Map<string, number>;
  capacity: number;
}) {
  const t = useTranslations("review");
  const { weekRangeLabel } = useDateLabels();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-fg">{t("nextTitle")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("weekOf", { range: weekRangeLabel(nextDays) })}
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-fg">{t("focusQuestion")}</span>
        <input
          value={focus}
          onChange={(e) => onFocus(e.target.value)}
          placeholder={t("focusPlaceholder")}
          className="h-11 w-full rounded-card border border-border bg-surface px-3.5 text-sm text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </label>

      <NextWeekGoals nextDays={nextDays} />

      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
          {t("fromBacklog", { n: backlog.length })}
        </p>
        <DayLoads days={nextDays} loads={loads} capacity={capacity} />
        {backlog.length === 0 ? (
          <p className="text-sm text-muted">{t("backlogEmpty")}</p>
        ) : (
          <TaskDayList tasks={backlog} days={nextDays} assign={assign} onToggle={onToggle} />
        )}
      </div>
    </div>
  );
}

/** Goals for next week: created on the spot, so they're there even if you
 *  leave the review halfway. */
function NextWeekGoals({ nextDays }: { nextDays: string[] }) {
  const t = useTranslations("review");
  const create = useCreateObjective();
  const objectives = useObjectives().data ?? [];
  const [title, setTitle] = useState("");
  const goals = objectives.filter(
    (o: Objective) => o.period === "week" && o.start_date === nextDays[0],
  );

  function add() {
    const t = title.trim();
    if (!t) return;
    create.mutate({ title: t, period: "week", start_date: nextDays[0], end_date: nextDays[6] });
    setTitle("");
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">{t("weekGoals")}</p>
      {goals.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {goals.map((o) => (
            <li
              key={o.id}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg shadow-soft"
            >
              <Target className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{o.title}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-1.5 shadow-soft">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t("newGoalPlaceholder")}
          aria-label={t("newGoalLabel")}
          className="h-8 w-full bg-transparent px-1.5 text-sm text-fg placeholder:text-subtle outline-none"
        />
        <button
          onClick={add}
          disabled={!title.trim() || create.isPending}
          className="h-8 shrink-0 cursor-pointer rounded-lg bg-primary px-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {t("add")}
        </button>
      </div>
    </div>
  );
}

/** Seven small bars: how full each day of next week would be. */
function DayLoads({
  days,
  loads,
  capacity,
}: {
  days: string[];
  loads: Map<string, number>;
  capacity: number;
}) {
  const tw = useTranslations("week");
  return (
    <div className="grid grid-cols-7 gap-1.5 rounded-card border border-border bg-surface p-3 shadow-soft">
      {days.map((d, i) => {
        const min = loads.get(d) ?? 0;
        const over = min > capacity;
        const pct = Math.min(100, (min / capacity) * 100);
        return (
          <div key={d} className="flex flex-col items-center gap-1" title={formatMinutes(min)}>
            <div className="flex h-12 w-full items-end overflow-hidden rounded-md bg-surface-2">
              <div
                className={cn("w-full rounded-md", over ? "bg-danger" : "bg-primary/60")}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="text-2xs font-semibold text-muted">
              {tw(`weekdayInitials.${DAY_KEYS[i]}`)}
            </span>
            <span
              className={cn(
                "text-[10px] tabular-nums",
                over ? "font-semibold text-danger" : "text-subtle",
              )}
            >
              {min > 0 ? formatMinutes(min) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TaskDayList({
  tasks,
  days,
  assign,
  onToggle,
}: {
  tasks: Task[];
  days: string[];
  assign: WeekAssignments;
  onToggle: (taskId: string, day: string) => void;
}) {
  const tw = useTranslations("week");
  const t = useTranslations("review");
  const { fullDayLabel } = useDateLabels();
  return (
    <ul className="flex flex-col gap-1.5">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-soft sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{task.title}</span>
            {task.time_estimate_min ? (
              <span className="shrink-0 text-2xs font-semibold tabular-nums text-muted">
                {formatMinutes(task.time_estimate_min)}
              </span>
            ) : null}
          </div>
          <div
            className="flex shrink-0 gap-1"
            role="group"
            aria-label={t("dayFor", { title: task.title })}
          >
            {days.map((d, i) => (
              <button
                key={d}
                onClick={() => onToggle(task.id, d)}
                aria-pressed={assign[task.id] === d}
                aria-label={fullDayLabel(d)}
                className={cn(
                  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                  assign[task.id] === d
                    ? "bg-primary text-on-primary"
                    : "bg-surface-2 text-muted hover:bg-border",
                )}
              >
                {tw(`weekdayInitials.${DAY_KEYS[i]}`)}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
