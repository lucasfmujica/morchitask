"use client";

import { useMemo, useState } from "react";
import { OWN_ERROR_UI } from "@/lib/mutation-errors";
import { useRouter } from "next/navigation";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Check, Target } from "lucide-react";
import {
  taskKeys,
  tasksForDateQueryOptions,
  useBacklogTasks,
  useMoveTaskToDate,
} from "@/lib/queries/tasks";
import { useMe } from "@/lib/queries/profiles";
import { useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
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
import { Button, SkeletonList, Well } from "@/components/ui";
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
  // Closing the week shows its own error line, so no generic toast on top.
  const upsert = useUpsertWeeklyNote(week, OWN_ERROR_UI);
  const move = useMoveTaskToDate(OWN_ERROR_UI);
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
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-[18px] pt-1 md:pt-3">
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}

      <header className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] leading-4 font-semibold tracking-[0.06em] text-muted uppercase">
            {t("weekOf", { range: weekRangeLabel(days) })}
          </span>
          <h1 className="font-display text-[28px] leading-9 font-semibold tracking-[-0.01em] text-fg md:text-[32px]">
            {t("title")}
          </h1>
        </div>
        <StepBar step={step} onJump={setStep} />
      </header>

      {step === 0 && (
        <StepLookBack
          week={days}
          weekTasks={weekTasks}
          meId={meId}
          summary={summary}
          closedDays={closedDays}
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

      <div className="sticky bottom-0 z-10 -mx-4 mt-1.5 flex items-center gap-2.5 border-t border-border bg-bg/95 px-4 py-3 pb-safe backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        {/* Kept in the layout on step 1 (just hidden) so the main button
            doesn't jump as you move between steps. */}
        <Button
          variant="ghost"
          size="lg"
          onClick={() => setStep(step - 1)}
          aria-hidden={step === 0}
          tabIndex={step === 0 ? -1 : undefined}
          className={cn(
            "h-[46px] px-[18px] text-sm text-muted hover:text-fg",
            step === 0 && "invisible",
          )}
        >
          {ts("back")}
        </Button>
        <Button
          size="lg"
          onClick={() => (isLast ? finish() : setStep(step + 1))}
          disabled={saving}
          className="ml-auto h-[46px] animate-glow px-[26px] text-sm"
        >
          {isLast ? (note?.completed_at ? t("saveAndSee") : t("close")) : ts("next")}
        </Button>
      </div>

      {saveError && <p className="text-right text-sm text-danger">{t("saveErrorRetry")}</p>}
    </div>
  );
}

function StepBar({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  const t = useTranslations("review");
  const ts = useTranslations("shutdown");
  return (
    <div className="flex flex-col gap-2">
      {/* Same bar as the daily shutdown: ink segments, "1 de 3 · Cómo fue"
          under each, so the bar is also the map. */}
      <div className="grid grid-cols-3 gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => onJump(i)}
            aria-label={ts("stepAria", { n: i + 1, name: t(label) })}
            aria-current={i === step ? "step" : undefined}
            className="group flex min-w-0 cursor-pointer flex-col gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none"
          >
            {/* The ink draws in from the left when a step is reached (it only
                mounts when lit, so moving back and forth replays it). */}
            <span className="block h-[5px] w-full overflow-hidden rounded-pill bg-border transition-colors duration-300 group-hover:bg-border-strong max-sm:h-1">
              {i <= step && (
                <span
                  className="block h-full w-full animate-seg rounded-pill bg-fg"
                  style={{ animationDelay: i === step ? "120ms" : "0ms" }}
                />
              )}
            </span>
            <span
              className={cn(
                "truncate text-2xs font-semibold max-sm:hidden",
                i === step ? "text-fg" : "text-muted",
              )}
            >
              {ts("stepOf", { step: i + 1, total: STEPS.length, name: t(label) })}
            </span>
          </button>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {ts("stepOf", { step: step + 1, total: STEPS.length, name: t(STEPS[step]) })}
      </span>
    </div>
  );
}

/** Step 1 — the week in numbers, its goals, and two lines for you. */
function StepLookBack({
  week,
  weekTasks,
  meId,
  summary,
  closedDays,
  wins,
  onWins,
  lessons,
  onLessons,
}: {
  week: string[];
  weekTasks: Task[];
  meId: string;
  summary: ReturnType<typeof weekSummary>;
  closedDays: Set<string>;
  wins: string;
  onWins: (v: string) => void;
  lessons: string;
  onLessons: (v: string) => void;
}) {
  const { done, total, estimatedMin, actualMin, bestDay } = summary;
  const t = useTranslations("review");
  const ts = useTranslations("shutdown");
  const { weekdayName } = useDateLabels();
  const closedCount = week.filter((d) => closedDays.has(d)).length;
  const hasTime = estimatedMin > 0 || actualMin > 0;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex animate-up flex-col gap-1">
        <h2 className="font-display text-[28px] leading-9 font-semibold tracking-[-0.01em] text-fg sm:text-[34px] sm:leading-[41px]">
          {done === 0 ? t("quietWeek") : t("doneCount", { n: done })}
        </h2>
        <p className="text-sm text-muted">
          {total === 0
            ? t("nothingPlanned")
            : actualMin > 0
              ? t("outOfPlannedMeasured", { total, time: formatMinutes(actualMin) })
              : t("outOfPlanned", { total })}
        </p>
      </div>

      {/* The chart takes two tracks and the closed-days tile one; on a phone
          they stack. */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <Well className="animate-up rounded-2xl sm:col-span-2" style={{ animationDelay: "100ms" }}>
          <DoneByDay week={week} tasks={weekTasks} meId={meId} bestDay={bestDay} />
        </Well>
        <Well
          className="flex animate-up flex-col gap-2.5 rounded-2xl p-[18px]"
          style={{ animationDelay: "160ms" }}
        >
          <span className="text-2xs text-muted">{t("closedDays")}</span>
          <span className="font-display text-[30px] leading-9 font-semibold text-fg">
            {t("closedDaysValue", { n: closedCount })}
          </span>
          <div className="flex gap-1.5" aria-hidden>
            {week.map((d, i) => (
              <span
                key={d}
                className={cn(
                  "h-4 w-4 animate-pop rounded-pill",
                  closedDays.has(d) ? "bg-fit" : "bg-border",
                )}
                style={{ animationDelay: `${300 + i * 60}ms` }}
              />
            ))}
          </div>
          {bestDay && (
            <span className="mt-auto pt-2 text-2xs text-muted">
              {t.rich("bestDayLine", {
                day: weekdayName(bestDay),
                b: (chunks) => <b className="font-bold text-fg">{chunks}</b>,
              })}
            </span>
          )}
        </Well>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Well className="animate-up rounded-2xl" style={{ animationDelay: "220ms" }}>
          <label className="flex h-full flex-col gap-2 rounded-[18px] bg-surface p-4">
            <span className="font-sans text-sm font-semibold text-fg">{t("winsQuestion")}</span>
            <textarea
              value={wins}
              onChange={(e) => onWins(e.target.value)}
              placeholder={t("winsPlaceholder")}
              rows={3}
              className="w-full resize-none rounded-[14px] border-0 bg-bg p-3 text-sm leading-5 text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>
        </Well>
        <Well className="animate-up rounded-2xl" style={{ animationDelay: "260ms" }}>
          <label className="flex h-full flex-col gap-2 rounded-[18px] bg-surface p-4">
            <span className="font-sans text-sm font-semibold text-fg">{t("lessonsQuestion")}</span>
            <textarea
              value={lessons}
              onChange={(e) => onLessons(e.target.value)}
              placeholder={t("lessonsPlaceholder")}
              rows={3}
              className="w-full resize-none rounded-[14px] border-0 bg-bg p-3 text-sm leading-5 text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>
        </Well>
      </div>

      {/* Not on the canvas, but worth keeping: the estimate-vs-actual pair and
          the week's goals. They sit under the two questions, so the step still
          opens on the chart and the writing. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3.5 empty:hidden">
        {hasTime && (
          <Well
            className="flex animate-up flex-col gap-2.5 rounded-2xl p-[18px]"
            style={{ animationDelay: "300ms" }}
          >
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
          </Well>
        )}
        <WeekGoals week={week} />
      </div>
    </div>
  );
}

/**
 * Seven bars: how many of your tasks got done each day. The best day is the
 * only green one, so the tile answers "which day carried the week" without a
 * legend. Counted from the same tasks as `weekSummary`, so the bars always add
 * up to the headline.
 */
function DoneByDay({
  week,
  tasks,
  meId,
  bestDay,
}: {
  week: string[];
  tasks: Task[];
  meId: string;
  bestDay: string | null;
}) {
  const t = useTranslations("review");
  const tw = useTranslations("week");
  const { fullDayLabel } = useDateLabels();
  const counts = week.map(
    (d) =>
      tasks.filter((x) => x.owner_id === meId && x.status === "done" && x.planned_date === d)
        .length,
  );
  const max = Math.max(1, ...counts);
  return (
    <figure
      aria-label={t("perDayChart")}
      className="flex h-[168px] items-end gap-1.5 rounded-[18px] bg-surface p-4 sm:gap-2.5"
    >
      {/* No stock utility grows a bar upward, so this keyframe travels with
          the chart. React hoists and dedupes it by href; the global
          reduced-motion rule collapses it to the finished bar. */}
      <style href="mt-grow" precedence="default">
        {"@keyframes mt-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}"}
      </style>
      {week.map((d, i) => (
        <div
          key={d}
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
          title={fullDayLabel(d)}
        >
          <span className="font-mono text-2xs text-muted">{counts[i]}</span>
          <span
            className={cn(
              "w-full origin-bottom rounded-[10px] transition-[height] duration-500",
              d === bestDay ? "bg-fit" : "bg-surface-2",
            )}
            style={{
              height: `${Math.max(6, (counts[i] / max) * 100)}%`,
              animation: `mt-grow 0.9s cubic-bezier(.2,.8,.2,1) ${200 + i * 70}ms both`,
            }}
          />
          <span className="text-2xs font-semibold text-muted">
            {tw(`weekdayInitials.${DAY_KEYS[i]}`)}
          </span>
        </div>
      ))}
    </figure>
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
    <Well
      className="flex animate-up flex-col gap-1.5 rounded-2xl"
      style={{ animationDelay: "340ms" }}
    >
      <p className="px-2.5 pt-2.5 pb-1 font-sans text-sm font-semibold text-fg">{t("yourGoals")}</p>
      <ul className="flex flex-col gap-1.5">
        {goals.map((o) => {
          const p = progress?.get(o.id);
          const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <li
              key={o.id}
              className="flex items-center gap-3 rounded-[16px] bg-surface px-3.5 py-3"
            >
              <Target className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                {o.title}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-pill px-2 py-0.5 font-mono text-2xs",
                  pct === 100 ? "bg-fit text-on-primary" : "bg-surface-2 text-muted",
                )}
              >
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </Well>
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
    <div className="flex flex-col gap-3">
      <div className="flex animate-up flex-col gap-1">
        <h2 className="font-display text-[28px] leading-[34px] font-semibold tracking-[-0.01em] text-fg">
          {t("leftoversTitle")}
        </h2>
        <p className="text-sm text-muted">
          {leftovers.length === 0 ? t("leftoversNone") : t("leftoversHint")}
        </p>
      </div>

      {leftovers.length === 0 ? (
        <p className="flex animate-up items-center gap-3 rounded-2xl bg-surface-2 p-4 text-sm font-medium text-fg">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-fit text-on-primary">
            <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </span>
          {t("leftoversClean")}
        </p>
      ) : (
        <>
          <TaskDayList tasks={leftovers} days={nextDays} assign={assign} onToggle={onToggle} />
          {/* Next week's load, under the list rather than above it: the canvas
              opens on the tasks, and the bars answer "is that day full?" once
              you've started placing them. */}
          <DayLoads days={nextDays} loads={loads} capacity={capacity} />
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
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex animate-up flex-col gap-2.5">
        <h2 className="font-display text-[28px] leading-[34px] font-semibold tracking-[-0.01em] text-fg">
          {t("nextTitle")}
        </h2>
        <label className="flex flex-col gap-2.5">
          <span className="text-sm font-semibold text-fg">{t("focusQuestion")}</span>
          <input
            value={focus}
            onChange={(e) => onFocus(e.target.value)}
            placeholder={t("focusPlaceholder")}
            className="h-[52px] w-full rounded-pill border-0 bg-surface px-5 text-sm text-fg shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06)] placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </label>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-start gap-3.5">
        <NextWeekGoals nextDays={nextDays} />

        <Well
          className="flex animate-up flex-col gap-1.5 rounded-2xl"
          style={{ animationDelay: "160ms" }}
        >
          <p className="px-2.5 pt-2.5 pb-1 font-sans text-sm font-semibold text-fg">
            {t("fromBacklog", { n: backlog.length })}
          </p>
          {backlog.length === 0 ? (
            <p className="px-2.5 pb-2.5 text-sm text-muted">{t("backlogEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {backlog.map((task) => (
                <BacklogPick
                  key={task.id}
                  task={task}
                  days={nextDays}
                  picked={assign[task.id]}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          )}
        </Well>
      </div>

      {/* The load of each day of next week, as you pull work into it. Not on the
          canvas; kept below the two columns where it informs without leading. */}
      {backlog.length > 0 && <DayLoads days={nextDays} loads={loads} capacity={capacity} />}
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
    <Well
      className="flex animate-up flex-col gap-1.5 rounded-2xl"
      style={{ animationDelay: "100ms" }}
    >
      <p className="px-2.5 pt-2.5 pb-1 font-sans text-sm font-semibold text-fg">{t("weekGoals")}</p>
      {goals.map((o) => (
        <div
          key={o.id}
          className="rounded-[16px] bg-surface px-3.5 py-3 text-sm font-semibold text-fg"
        >
          {o.title}
        </div>
      ))}
      <div className="flex items-center gap-2 rounded-pill bg-surface py-1.5 pr-1.5 pl-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t("newGoalPlaceholder")}
          aria-label={t("newGoalLabel")}
          className="h-[34px] min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
        />
        <button
          onClick={add}
          disabled={!title.trim() || create.isPending}
          className="h-[34px] shrink-0 cursor-pointer rounded-pill bg-surface-2 px-3.5 text-2xs font-semibold text-fg transition-colors hover:bg-border disabled:cursor-default disabled:opacity-50"
        >
          {t("add")}
        </button>
      </div>
    </Well>
  );
}

/**
 * One backlog task in the half-width column. Seven day buttons don't fit next
 * to a title at that width, so the row shows "Elegir día" (or the day you
 * picked) and opens the day row underneath on demand.
 */
function BacklogPick({
  task,
  days,
  picked,
  onToggle,
}: {
  task: Task;
  days: string[];
  picked: string | undefined;
  onToggle: (taskId: string, day: string) => void;
}) {
  const t = useTranslations("review");
  const { shortDayLabel } = useDateLabels();
  const channelsById = useChannelLookup().data ?? EMPTY_CHANNEL_MAP;
  const channel = task.channel_id ? channelsById.get(task.channel_id) : undefined;
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-col gap-2 rounded-[16px] bg-surface py-2.5 pr-2.5 pl-3.5">
      <div className="flex items-center gap-2.5">
        <ChannelDot color={channel?.color} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
          {task.title}
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            "h-[30px] shrink-0 cursor-pointer rounded-pill px-3 text-2xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
            picked ? "bg-fit text-on-primary" : "bg-surface-2 text-fg hover:bg-border",
          )}
        >
          {picked ? shortDayLabel(picked) : t("pickDay")}
        </button>
      </div>
      {open && (
        <DayButtons
          task={task}
          days={days}
          picked={picked}
          onCard
          onToggle={(id, d) => {
            onToggle(id, d);
            setOpen(false);
          }}
        />
      )}
    </li>
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
    <Well
      className="grid animate-up grid-cols-7 gap-1.5 rounded-2xl p-3"
      style={{ animationDelay: "240ms" }}
    >
      {days.map((d, i) => {
        const min = loads.get(d) ?? 0;
        const over = min > capacity;
        const pct = Math.min(100, (min / capacity) * 100);
        return (
          <div key={d} className="flex flex-col items-center gap-1" title={formatMinutes(min)}>
            <div className="flex h-12 w-full items-end overflow-hidden rounded-[10px] bg-surface">
              <div
                className={cn(
                  "w-full rounded-[10px] transition-[height] duration-300",
                  over ? "bg-danger" : "bg-fit",
                )}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="text-2xs font-semibold text-muted">
              {tw(`weekdayInitials.${DAY_KEYS[i]}`)}
            </span>
            <span
              className={cn(
                "font-mono text-[10px]",
                over ? "font-semibold text-danger" : "text-subtle",
              )}
            >
              {min > 0 ? formatMinutes(min) : "—"}
            </span>
          </div>
        );
      })}
    </Well>
  );
}

/** The category square from the canvas; a neutral one when there's no channel. */
function ChannelDot({ color }: { color?: string }) {
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-[2px] bg-border-strong"
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    />
  );
}

/** One round button per day of next week; tapping the picked one un-picks it.
 *  `onCard` when they sit on a white card instead of a grey row, where white
 *  buttons would vanish. */
function DayButtons({
  task,
  days,
  picked,
  onToggle,
  onCard = false,
}: {
  task: Task;
  days: string[];
  picked: string | undefined;
  onToggle: (taskId: string, day: string) => void;
  onCard?: boolean;
}) {
  const tw = useTranslations("week");
  const t = useTranslations("review");
  const { fullDayLabel } = useDateLabels();
  return (
    <div
      className="flex shrink-0 gap-1"
      role="group"
      aria-label={t("dayFor", { title: task.title })}
    >
      {days.map((d, i) => (
        <button
          key={d}
          onClick={() => onToggle(task.id, d)}
          aria-pressed={picked === d}
          aria-label={fullDayLabel(d)}
          className={cn(
            "flex h-9 w-9 cursor-pointer items-center justify-center rounded-pill text-2xs font-bold transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
            // Picked is the canvas's white initial on the mint gradient.
            picked === d
              ? "bg-fit text-on-primary"
              : onCard
                ? "bg-surface-2 text-fg hover:bg-border"
                : "bg-surface text-fg hover:bg-border",
          )}
        >
          {tw(`weekdayInitials.${DAY_KEYS[i]}`)}
        </button>
      ))}
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
  const channelsById = useChannelLookup().data ?? EMPTY_CHANNEL_MAP;
  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task, i) => {
        const channel = task.channel_id ? channelsById.get(task.channel_id) : undefined;
        return (
          <li
            key={task.id}
            className="flex animate-up flex-wrap items-center gap-2.5 rounded-[22px] bg-surface-2 py-2 pr-2 pl-[18px]"
            style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
          >
            <ChannelDot color={channel?.color} />
            <span className="min-w-0 flex-[1_1_160px] truncate text-sm font-semibold text-fg">
              {task.title}
            </span>
            {task.time_estimate_min ? (
              <span className="shrink-0 font-mono text-2xs text-muted">
                {formatMinutes(task.time_estimate_min)}
              </span>
            ) : null}
            <DayButtons task={task} days={days} picked={assign[task.id]} onToggle={onToggle} />
          </li>
        );
      })}
    </ul>
  );
}
