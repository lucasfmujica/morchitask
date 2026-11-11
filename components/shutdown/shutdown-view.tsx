"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
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
import { carryOverTarget, todayISO } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import {
  accuracyLabelKey,
  carryDestination,
  defaultCarryPlan,
  MOODS,
  projectedTomorrowMin,
  shutdownSummary,
  splitByDestination,
  type CarryDestination,
  type CarryPlan,
} from "@/lib/shutdown";
import { resolveCapacity } from "@/lib/capacity";
import { orderForAppend } from "@/lib/ordering";
import { cn } from "@/lib/utils";
import { Confetti } from "@/components/ui/confetti";
import { Button, SkeletonList, Well } from "@/components/ui";
import { TaskReactions } from "@/components/tasks/task-reactions";
import { PastDayNotice } from "@/components/day/past-day-notice";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

/** The step names are words, so they live in the catalog; the array holds the
 *  keys, which is also what the progress bar indexes. */
const STEP_KEYS = ["stepCelebrate", "stepReflect", "stepTomorrow"] as const;

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
  const labels = useDateLabels();
  const ts = useTranslations("shutdown");
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

  const isLast = step === STEP_KEYS.length - 1;

  return (
    <div className="relative isolate mx-auto flex w-full max-w-[760px] flex-col gap-[18px] pt-1 md:pt-3">
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}

      {/* On a phone the ritual reads as one green screen (the canvas's mobile
          closing ritual): the wash sits behind the header and the hero, and
          fades out before the step content so the tiles keep their contrast. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 -top-5 -z-10 h-[460px] bg-linear-to-b from-primary-soft via-primary-soft/60 to-transparent md:hidden"
      />

      <header className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <h1 className="mr-auto font-display text-[28px] leading-9 font-bold tracking-tight text-fg md:text-[32px]">
            {ts("title")}
          </h1>
          <span className="font-mono text-xs text-muted uppercase">
            {labels.shortDayLabel(date)}
          </span>
        </div>
        <StepBar step={step} onJump={setStep} />
      </header>

      <PastDayNotice date={date}>
        {ts.rich("pastNotice", {
          day: labels.fullDayLabel(date),
          b: (chunks) => <span className="font-semibold">{chunks}</span>,
        })}
      </PastDayNotice>

      {step === 0 && (
        <StepCelebrate
          done={done}
          total={done.length + allPending.length}
          estimatedMin={estimatedMin}
          actualMin={actualMin}
          accuracy={accuracy}
          intention={note?.intention ?? null}
          streak={streak}
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
          onPick={(id, dest) => setPlan((p) => ({ ...p, [id]: dest }))}
          projectedMin={projectedMin}
          capacityTarget={capacityTarget}
          channelsById={channelsById}
        />
      )}

      {/* On a phone the CTA is pinned: the step content scrolls under it, so
          "Cerrar el día" is never a scroll away. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-1.5 flex items-center gap-2.5 border-t border-border bg-bg/95 px-4 py-3 pb-safe backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        {/* Kept in the layout on step 1 (just hidden) so "Seguir" doesn't jump
            sideways as you move between steps. */}
        <Button
          variant="ghost"
          size="lg"
          onClick={() => setStep(step - 1)}
          aria-hidden={step === 0}
          tabIndex={step === 0 ? -1 : undefined}
          className={cn("px-[18px] text-muted hover:text-fg", step === 0 && "invisible")}
        >
          {ts("back")}
        </Button>
        <Button
          size="lg"
          onClick={() => (isLast ? closeDay() : setStep(step + 1))}
          disabled={upsert.isPending}
          className="ml-auto px-[26px]"
        >
          {isLast ? (alreadyClosed ? ts("saveAndSee") : ts("title")) : ts("next")}
        </Button>
      </div>

      {saveError && <p className="text-right text-sm text-danger">{ts("saveErrorRetry")}</p>}
    </div>
  );
}

function StepBar({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  const ts = useTranslations("shutdown");
  return (
    <div className="flex flex-col gap-2">
      {/* Each segment carries "1 de 3 · Celebrá" underneath, so the bar is also
          the map. Ink, not green: green on this screen means "done", and a step
          you're merely on isn't done yet. */}
      <div className="grid grid-cols-3 gap-2">
        {STEP_KEYS.map((key, i) => (
          <button
            key={key}
            onClick={() => onJump(i)}
            aria-label={ts("stepAria", { n: i + 1, name: ts(key) })}
            aria-current={i === step ? "step" : undefined}
            className="group flex min-w-0 cursor-pointer flex-col gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:outline-none"
          >
            <span
              className={cn(
                "block h-[5px] w-full rounded-pill transition-colors duration-300",
                i <= step ? "bg-fg" : "bg-border group-hover:bg-border-strong",
              )}
            />
            <span
              className={cn(
                "truncate text-xs font-semibold max-sm:hidden",
                i === step ? "text-fg" : "text-muted",
              )}
            >
              {ts("stepOf", { step: i + 1, total: STEP_KEYS.length, name: ts(key) })}
            </span>
          </button>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {ts("stepOf", { step: step + 1, total: STEP_KEYS.length, name: ts(STEP_KEYS[step]) })}
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
  streak,
  channelsById,
}: {
  done: Task[];
  total: number;
  estimatedMin: number;
  actualMin: number;
  accuracy: number | null;
  intention: string | null;
  streak: number;
  channelsById: Map<string, Channel>;
}) {
  const ts = useTranslations("shutdown");
  const acc = accuracyLabelKey(accuracy);
  const sharedDone = done.filter((t) => t.shared);
  const hasTime = estimatedMin > 0 || actualMin > 0;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Desktop: a green-washed card with the check beside the headline.
          Phone: the card dissolves into the screen's wash and everything
          centres under a bigger check, as in the mobile ritual. */}
      <div className="flex flex-col items-center gap-4 pt-4 text-center sm:flex-row sm:gap-[22px] sm:rounded-[28px] sm:bg-linear-to-b sm:from-primary-soft sm:to-surface sm:to-85% sm:p-7 sm:text-left">
        {/* The big green check only when something got done: on an empty day
            it would be congratulating you for nothing. */}
        {done.length > 0 && (
          <span className="grid h-[104px] w-[104px] shrink-0 place-items-center rounded-pill bg-fit text-on-primary shadow-[0_12px_28px_-6px] shadow-primary/45 sm:h-[84px] sm:w-[84px]">
            <Check className="h-11 w-11 sm:h-[38px] sm:w-[38px]" strokeWidth={2.6} aria-hidden />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-[30px] leading-[34px] font-bold tracking-tight text-fg sm:text-[34px] sm:leading-10">
            {done.length === 0 ? ts("nothingDone") : ts("didCount", { n: done.length })}
          </h2>
          <p className="text-[15px] text-muted sm:text-sm">
            {done.length === 0
              ? ts("nothingDoneHint")
              : actualMin > 0
                ? ts("outOfPlannedMeasured", { total, time: formatMinutes(actualMin) })
                : ts("outOfPlanned", { total })}
          </p>
        </div>
      </div>

      {/* The bento: estimate vs actual, the morning's intention, the streak.
          auto-fit so a missing tile (nothing tracked, no intention) lets the
          others widen instead of leaving a hole. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        {/* Estimated vs actual, as two bars against a shared scale. Two sentences
          made you do the arithmetic; two bars make the gap the thing you see —
          which is the whole feedback loop this screen exists for. */}
        {hasTime && (
          <Well className="flex flex-col gap-2.5 rounded-2xl p-[18px]">
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
            {acc && (
              <p
                className={cn(
                  "self-start rounded-pill px-2.5 py-1 text-xs font-semibold",
                  acc.key === "accuracyOnTarget"
                    ? "bg-primary-soft text-primary"
                    : "bg-accent-soft text-accent",
                )}
              >
                {ts(acc.key, { pct: acc.pct })}
              </p>
            )}
          </Well>
        )}

        {/* The morning's intention, closing the loop it opened in /plan — with
          the day's result attached, so it reads as answered rather than filed. */}
        {intention && (
          <Well className="flex flex-col gap-2 rounded-2xl p-[18px]">
            <p className="text-xs text-muted">{ts("morningIntention")}</p>
            <p className="font-display text-base leading-[21px] font-semibold text-fg">
              {intention}
            </p>
            <p className="mt-auto text-xs font-semibold text-primary">
              {done.length === 0
                ? ts("intentionPending")
                : done.length === total
                  ? ts("intentionDone")
                  : ts("intentionPartial", { done: done.length, total })}
            </p>
          </Well>
        )}

        <StreakTile streak={streak} />
      </div>

      {/* Shared work you finished, each with the kudos bar so the other person
          can leave a mimo. Pills, as in the canvas; one per task because each
          task carries its own reactions. */}
      {sharedDone.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-xs font-semibold text-muted">{ts("sharedDoneLove")}</p>
          {sharedDone.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-2.5 rounded-[22px] bg-surface py-2 pr-2 pl-2.5 shadow-soft sm:rounded-pill"
            >
              <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-pill bg-fit text-on-primary">
                <Check className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
                {t.title}
              </span>
              <TaskReactions taskId={t.id} size="sm" />
            </div>
          ))}
        </div>
      )}

      {/* The list of what got done isn't on the canvas, which leads with the
          count; it stays one tap away for the days you want to see it. */}
      {done.length > 0 && (
        <details className="group">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-pill px-1 py-1 text-xs font-semibold text-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
              aria-hidden
            />
            {ts("doneListToggle", { n: done.length })}
          </summary>
          <Well className="mt-2">
            <ul className="flex flex-col divide-y divide-border/60 rounded-xl bg-surface px-4 shadow-soft">
              {done.map((t) => {
                const channel = t.channel_id ? channelsById.get(t.channel_id) : undefined;
                return (
                  <li key={t.id} className="flex items-center gap-2.5 py-2.5">
                    <Check
                      className="h-4 w-4 shrink-0 text-primary"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    {channel && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: channel.color }}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{t.title}</span>
                    {t.actual_time_min ? (
                      <span className="shrink-0 font-mono text-2xs text-muted">
                        {formatMinutes(t.actual_time_min)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Well>
        </details>
      )}
    </div>
  );
}

/** How many of the last STREAK_DOTS days are part of the current run. The
 *  streak is a count, not a calendar, so the dots are the run drawn from the
 *  right: honest about length, silent about which older days were missed. */
const STREAK_DOTS = 14;

/** The dark tile: the streak as a big number, with the run drawn as dots. It
 *  used to be a small chip in the header, easy to miss on the one screen that
 *  feeds it. */
function StreakTile({ streak }: { streak: number }) {
  const ts = useTranslations("shutdown");
  const lit = Math.min(streak, STREAK_DOTS);
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-fg p-[18px] text-bg">
      <span className="font-display text-[34px] leading-10 font-bold tabular-nums">{streak}</span>
      <span className="text-[13px] text-bg/75">
        {streak > 0 ? ts("streak", { n: streak }) : ts("streakNone")}
      </span>
      <div className="mt-auto flex gap-[5px]" aria-hidden>
        {Array.from({ length: STREAK_DOTS }, (_, i) => (
          <span
            key={i}
            className={cn(
              // Shrink rather than overflow: 14 dots at 12px don't fit the
              // narrowest tile the auto-fit grid can produce.
              "aspect-square max-w-3 min-w-0 flex-1 rounded-pill",
              i >= STREAK_DOTS - lit ? "bg-fit" : "bg-bg/20",
            )}
          />
        ))}
      </div>
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
  const ts = useTranslations("shutdown");
  return (
    <Well className="rounded-[28px]">
      <div className="flex flex-col gap-[18px] rounded-[22px] bg-surface p-5 shadow-soft sm:p-7">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[28px] leading-9 font-bold tracking-tight text-fg">
            {ts("moodQuestion")}
          </h2>
          <p className="text-sm text-muted">{ts("moodHint")}</p>
        </div>

        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {MOODS.map((m, idx) => {
            const on = mood === m.value;
            return (
              <button
                key={m.value}
                onClick={() => onMood(m.value)}
                aria-pressed={on}
                aria-label={ts(m.labelKey)}
                className={cn(
                  "flex h-[88px] min-w-0 cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl px-1 transition-[background-color,color,transform,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                  on
                    ? "-translate-y-0.5 bg-primary text-on-primary shadow-card"
                    : "bg-bg text-fg hover:bg-surface-2",
                )}
              >
                {/* A rising five-bar meter instead of faces: it reads as "how
                    much" at a glance and doesn't put an expression on your day. */}
                <span className="flex h-[22px] items-end gap-[3px]" aria-hidden>
                  {[0, 1, 2, 3, 4].map((k) => (
                    <span
                      key={k}
                      style={{ height: 6 + k * 4 }}
                      className={cn(
                        "w-[5px] rounded-[3px]",
                        k <= idx
                          ? on
                            ? "bg-on-primary"
                            : "bg-fg"
                          : on
                            ? "bg-on-primary/35"
                            : "bg-border",
                      )}
                    />
                  ))}
                </span>
                <span className="max-w-full truncate text-2xs font-semibold sm:text-[13px]">
                  {ts(m.labelKey)}
                </span>
              </button>
            );
          })}
        </div>

        <textarea
          value={reflection}
          onChange={(e) => onReflection(e.target.value)}
          placeholder={ts("reflectionPlaceholder")}
          aria-label={ts("moodHint")}
          rows={5}
          className="w-full resize-none rounded-[16px] border-0 bg-bg p-3.5 text-sm leading-[21px] text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </div>
    </Well>
  );
}

/**
 * Step 3 — decide where each leftover goes, then close.
 *
 * It used to be one "Mover N a mañana" button: all or nothing. That's how
 * tomorrow ends up pre-loaded with today's failures before you've even planned
 * it. Each task now carries its own destination, and the bar below shows what
 * tomorrow would weigh once you apply them — so parking something in the
 * backlog is a visible relief rather than an admission.
 */
function StepTomorrow({
  pending,
  tomorrow,
  plan,
  onPick,
  projectedMin,
  capacityTarget,
  channelsById,
}: {
  pending: Task[];
  tomorrow: string;
  plan: CarryPlan;
  onPick: (taskId: string, dest: CarryDestination) => void;
  projectedMin: number;
  capacityTarget: number;
  channelsById: Map<string, Channel>;
}) {
  const ts = useTranslations("shutdown");
  const tnav = useTranslations("nav");
  const tcm = useTranslations("common");
  const labels = useDateLabels();
  // Closing an old day carries its leftovers to today, not to "mañana" — so the
  // copy has to name the day it's actually moving them to. Compared as dates:
  // this used to lowercase the day's LABEL and test it against "hoy", which
  // silently stopped being true the moment that label could be "Today".
  const toToday = tomorrow === todayISO();
  const targetName = toToday ? tcm("today") : tcm("tomorrow");
  const over = projectedMin > capacityTarget;
  const options: { dest: CarryDestination; label: string }[] = [
    { dest: "tomorrow", label: targetName },
    { dest: "backlog", label: tnav("backlog") },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[28px] leading-9 font-bold tracking-tight text-fg">
          {toToday ? ts("todayHeading") : ts("tomorrowHeading")}
        </h2>
        <p className="text-sm text-muted">
          {pending.length === 0 ? ts("nothingPending") : ts("pendingCount", { n: pending.length })}
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4 text-sm font-medium text-fg">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-fit text-on-primary">
            <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </span>
          {ts("allClosed")}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {pending.map((t) => {
              const dest = carryDestination(plan, t.id);
              const channel = t.channel_id ? channelsById.get(t.channel_id) : undefined;
              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 py-2 pr-2 pl-[18px]"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-[2px] bg-border-strong"
                    style={channel ? { backgroundColor: channel.color } : undefined}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-[1_1_140px] truncate text-sm font-semibold text-fg">
                    {t.title}
                  </span>
                  {t.time_estimate_min ? (
                    <span className="shrink-0 font-mono text-xs text-muted">
                      {formatMinutes(t.time_estimate_min)}
                    </span>
                  ) : null}
                  <div
                    role="group"
                    aria-label={ts("destinationOf", { title: t.title })}
                    className="flex shrink-0 gap-0.5 rounded-pill bg-border p-[3px] max-sm:ml-auto"
                  >
                    {options.map((o) => (
                      <button
                        key={o.dest}
                        onClick={() => onPick(t.id, o.dest)}
                        aria-pressed={dest === o.dest}
                        className={cn(
                          "h-[34px] cursor-pointer rounded-pill px-3.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                          dest === o.dest
                            ? "bg-surface text-fg shadow-soft"
                            : "bg-transparent text-muted hover:text-fg",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* What you just decided, in minutes: the day it lands on, drawn
              against your capacity. Over budget is said in words and drawn
              hatched, never by colour alone. */}
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[20px] px-[18px] py-3.5",
              over ? "bg-accent-soft text-accent" : "bg-primary-soft text-fg",
            )}
          >
            <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-pill bg-surface/70">
              <div
                className={cn(
                  "h-full rounded-pill transition-[width] duration-500",
                  !over && "bg-fit",
                )}
                style={{
                  width: `${Math.min(100, capacityTarget > 0 ? (projectedMin / capacityTarget) * 100 : 0)}%`,
                  backgroundImage: over
                    ? "repeating-linear-gradient(45deg, var(--accent) 0 5px, color-mix(in srgb, var(--accent) 70%, var(--surface)) 5px 10px)"
                    : undefined,
                }}
              />
            </div>
            <p className="text-[13px] font-semibold">
              {ts.rich(over ? "weighDayOver" : "weighDay", {
                day: labels.weekdayName(tomorrow),
                planned: formatMinutes(projectedMin),
                capacity: formatMinutes(capacityTarget),
                b: (chunks) => <strong className="font-bold">{chunks}</strong>,
              })}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One bar of the estimate-vs-actual pair. Both are drawn against the SAME
 * maximum, which is the only way the comparison means anything. The label
 * arrives translated from the caller, so this stays presentational.
 */
export function CompareBar({
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
      <div className="mt-1 h-2.5 rounded-pill bg-border">
        <div
          className={cn(
            "h-full rounded-pill transition-[width] duration-500",
            tone === "solid" ? "bg-fit" : "bg-border-strong",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
