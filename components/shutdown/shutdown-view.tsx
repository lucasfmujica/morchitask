"use client";

import { useState } from "react";
import { OWN_ERROR_UI } from "@/lib/mutation-errors";
import { useRouter } from "next/navigation";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react";
import { taskKeys, useMoveTaskToDate, useTasksForDate } from "@/lib/queries/tasks";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { reactionKeys } from "@/lib/queries/reactions";
import { addReaction, getReactions, removeReaction } from "@/lib/actions/reactions";
import { useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import {
  rolloverIncomplete,
  useDailyNote,
  useShutdownStreak,
  useUpsertDailyNote,
} from "@/lib/queries/daily-notes";
import type { Channel, DailyNote, Task, TaskReaction } from "@/lib/queries/types";
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
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import { PastDayNotice } from "@/components/day/past-day-notice";
import { useDateLabels } from "@/lib/use-date-labels";
import { useLocale, useTranslations } from "next-intl";

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
  // Closing the day shows its own error line, so no generic toast on top.
  const upsert = useUpsertDailyNote(date, OWN_ERROR_UI);
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
  // What the other person finished on the shared list today: the canvas thanks
  // them by name instead of listing your own shared tasks back at you.
  const partnerDone = tasks.filter((t) => t.shared && t.status === "done" && t.owner_id !== meId);
  // Not always `date + 1`: closing an old day carries its leftovers to today,
  // never to another past day where they'd strand out of sight.
  const tomorrow = carryOverTarget(date);
  const alreadyClosed = !!note?.shutdown_completed_at;
  const move = useMoveTaskToDate(OWN_ERROR_UI);
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
          <span className="font-mono text-2xs text-muted uppercase">
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
          partnerDone={partnerDone}
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
          className={cn(
            "h-[46px] px-[18px] text-sm text-muted hover:text-fg",
            step === 0 && "invisible",
          )}
        >
          {ts("back")}
        </Button>
        <Button
          size="lg"
          onClick={() => (isLast ? closeDay() : setStep(step + 1))}
          disabled={upsert.isPending}
          // The canvas CTA breathes (glow) once the screen has settled, the
          // one moving thing left on a finished ritual.
          className="ml-auto h-[46px] animate-glow px-[26px] text-sm"
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
            {/* The ink is a child of the track so it can draw in from the left
                (animate-seg) the moment a step is reached, as on the canvas;
                it mounts only when lit, so going back and forward replays it. */}
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
  partnerDone,
  channelsById,
}: {
  done: Task[];
  total: number;
  estimatedMin: number;
  actualMin: number;
  accuracy: number | null;
  intention: string | null;
  streak: number;
  partnerDone: Task[];
  channelsById: Map<string, Channel>;
}) {
  const ts = useTranslations("shutdown");
  const acc = accuracyLabelKey(accuracy);
  const hasTime = estimatedMin > 0 || actualMin > 0;
  const barMax = Math.max(estimatedMin, actualMin);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Desktop: a mint-washed card with the check beside the headline.
          Phone: the card dissolves into the screen's wash and everything
          centres under a bigger check with its halos, as in the mobile ritual. */}
      <div className="flex animate-up flex-col items-center gap-4 pt-4 text-center sm:flex-row sm:gap-[22px] sm:rounded-[28px] sm:bg-linear-to-b sm:from-[color-mix(in_srgb,var(--fit-from)_40%,var(--surface))] sm:to-surface sm:to-85% sm:p-7 sm:text-left">
        {/* The big green check only when something got done: on an empty day
            it would be congratulating you for nothing. */}
        {done.length > 0 && <CelebrationCheck />}
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-[30px] leading-[34px] font-bold tracking-[-0.02em] text-fg sm:text-[34px] sm:leading-[41px]">
            {done.length === 0 ? ts("nothingDone") : ts("didCount", { n: done.length })}
          </h2>
          <p className="text-[15px] leading-[21px] text-muted sm:text-sm">
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
          others widen instead of leaving a hole. Tiles cascade in 60ms apart. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        {/* Estimated vs actual, as two bars against a shared scale. Two sentences
          made you do the arithmetic; two bars make the gap the thing you see —
          which is the whole feedback loop this screen exists for. */}
        {hasTime && (
          <div
            className="flex animate-up flex-col gap-2.5 rounded-2xl bg-surface-2 p-[18px]"
            style={{ animationDelay: "120ms" }}
          >
            <CompareBar
              label={ts("estimatedBar")}
              min={estimatedMin}
              max={barMax}
              tone="soft"
              delayMs={400}
            />
            <CompareBar
              label={ts("workedBar")}
              min={actualMin}
              max={barMax}
              tone="solid"
              delayMs={600}
            />
            {acc && (
              <p
                className={cn(
                  "self-start rounded-pill px-2.5 py-1 text-2xs font-semibold",
                  acc.key === "accuracyOnTarget"
                    ? "bg-primary-soft text-primary"
                    : "bg-accent-soft text-accent",
                )}
              >
                {ts(acc.key, { pct: acc.pct })}
              </p>
            )}
          </div>
        )}

        {/* The morning's intention, closing the loop it opened in /plan — with
          the day's result attached, so it reads as answered rather than filed. */}
        {intention && (
          <div
            className="flex animate-up flex-col gap-2 rounded-2xl bg-surface-2 p-[18px]"
            style={{ animationDelay: "180ms" }}
          >
            <p className="text-2xs text-muted">{ts("morningIntention")}</p>
            <p className="font-display text-base leading-[21px] font-semibold text-fg">
              {intention}
            </p>
            <p className="mt-auto text-2xs font-semibold text-primary">
              {done.length === 0
                ? ts("intentionPending")
                : done.length === total
                  ? ts("intentionDone")
                  : ts("intentionPartial", { done: done.length, total })}
            </p>
          </div>
        )}

        <StreakTile streak={streak} />
      </div>

      {partnerDone.length > 0 && <PartnerLove tasks={partnerDone} />}

      {/* The list of what got done isn't on the canvas, which leads with the
          count; it stays one tap away for the days you want to see it. */}
      {done.length > 0 && (
        <details className="group animate-up" style={{ animationDelay: "360ms" }}>
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-pill px-1 py-1 text-2xs font-semibold text-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none [&::-webkit-details-marker]:hidden">
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

/**
 * The hero check: pops in, then the tick draws itself. Desktop is the 84px
 * canvas check; on a phone it grows to the mobile ritual's 104px with two
 * white halos rippling out behind it.
 */
export function CelebrationCheck() {
  return (
    <span className="relative grid shrink-0 place-items-center max-sm:h-[150px] max-sm:w-[150px]">
      {/* globals.css has no stroke keyframe, so the one gesture only this check
          uses travels with it; React hoists and dedupes it by href. Under
          reduced motion the global rule collapses it to the finished tick. */}
      <style href="mt-draw" precedence="default">
        {"@keyframes mt-draw{from{stroke-dashoffset:40}to{stroke-dashoffset:0}}"}
      </style>
      {[900, 2200].map((delay) => (
        <span
          key={delay}
          aria-hidden
          className="absolute inset-5 animate-halo rounded-pill border-[1.5px] border-surface/95 sm:hidden"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
      <span className="relative grid h-[104px] w-[104px] animate-pop place-items-center rounded-pill bg-fit shadow-[0_12px_28px_color-mix(in_srgb,var(--primary)_35%,transparent)] sm:h-[84px] sm:w-[84px]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-[46px] w-[46px] sm:h-[38px] sm:w-[38px]"
          aria-hidden
        >
          {/* The tick writes itself after the pop lands, as on the canvas. */}
          <path
            d="m5.5 12.5 4 4 9-10"
            stroke="var(--color-on-primary)"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={40}
            style={{ animation: "mt-draw 0.5s ease-out 0.5s both" }}
          />
        </svg>
      </span>
    </span>
  );
}

/**
 * What the other person finished on the shared list, as ONE sentence with one
 * heart, the way the canvas has it. It used to be a row per task with the
 * whole emoji bar each, which turned a thank-you into a form. The heart leaves
 * a ❤️ on every one of those tasks (and takes it back if they all have it);
 * the other emojis stay on each task's detail sheet.
 */
function PartnerLove({ tasks }: { tasks: Task[] }) {
  const ts = useTranslations("shutdown");
  const locale = useLocale();
  const qc = useQueryClient();
  const me = useMe().data;
  const profiles = useProfiles().data ?? [];
  // Grouped by person: in a two-person household that's one row, but the
  // sentence names one person, so it can't silently merge two.
  const byOwner = new Map<string, Task[]>();
  for (const t of tasks) byOwner.set(t.owner_id, [...(byOwner.get(t.owner_id) ?? []), t]);

  const reactions = useQueries({
    queries: tasks.map((t) => ({
      queryKey: reactionKeys.task(t.id),
      queryFn: (): Promise<TaskReaction[]> => getReactions(t.id),
    })),
  });
  const myHeart = new Map<string, TaskReaction | undefined>();
  tasks.forEach((t, i) =>
    myHeart.set(
      t.id,
      reactions[i]?.data?.find((r) => r.author_id === me?.id && r.emoji === LOVE),
    ),
  );

  const [busy, setBusy] = useState(false);
  async function toggleLove(group: Task[]) {
    const loved = group.every((t) => myHeart.get(t.id));
    setBusy(true);
    try {
      await Promise.all(
        group.map((t) => {
          const mine = myHeart.get(t.id);
          if (loved && mine) return removeReaction(mine.id);
          if (!loved && !mine) return addReaction(t.id, LOVE);
          return null;
        }),
      );
    } finally {
      setBusy(false);
      group.forEach((t) => qc.invalidateQueries({ queryKey: reactionKeys.task(t.id) }));
    }
  }

  const list = new Intl.ListFormat(locale, { type: "conjunction" });
  return (
    <>
      {[...byOwner].map(([ownerId, group]) => {
        const profile = profiles.find((p) => p.id === ownerId);
        const name = profile?.display_name.split(" ")[0] ?? "";
        const loved = group.every((t) => myHeart.get(t.id));
        const titles = group.map((t) => t.title);
        const b = (chunks: React.ReactNode) => <b className="font-bold">{chunks}</b>;
        return (
          <div
            key={ownerId}
            className="flex animate-up items-center gap-2.5 rounded-[22px] bg-surface py-2 pr-2 pl-2.5 shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06)] sm:rounded-pill"
            style={{ animationDelay: "300ms" }}
          >
            <OwnerAvatar profile={profile} size={30} />
            <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-fg">
              {titles.length > 3
                ? ts.rich("partnerDidMore", {
                    name,
                    tasks: titles.slice(0, 3).join(", "),
                    more: titles.length - 3,
                    b,
                  })
                : ts.rich("partnerDid", { name, tasks: list.format(titles), b })}
            </p>
            <button
              type="button"
              onClick={() => toggleLove(group)}
              disabled={busy}
              aria-pressed={loved}
              aria-label={ts("sendLoveTo", { name })}
              className={cn(
                "grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-pill transition-colors duration-250 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                loved ? "bg-primary-soft" : "bg-surface-2 hover:bg-border",
              )}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M8 13.5S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.5-6 7.5Z"
                  className={cn(
                    "stroke-fg transition-[fill] duration-250",
                    loved ? "fill-primary" : "fill-transparent",
                  )}
                  strokeWidth={1.3}
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        );
      })}
    </>
  );
}

/** The emoji the heart button leaves; one of REACTION_EMOJIS, so it shows up
 *  in the task's own kudos bar like any other reaction. */
const LOVE = "❤️";

/** How many of the last STREAK_DOTS days are part of the current run. The
 *  streak is a count, not a calendar, so the dots are the run drawn from the
 *  right: honest about length, silent about which older days were missed. */
const STREAK_DOTS = 14;

/** The dark tile: the streak as a big number, with the run drawn as dots that
 *  pop in one after another. It used to be a small chip in the header, easy to
 *  miss on the one screen that feeds it. */
function StreakTile({ streak }: { streak: number }) {
  const ts = useTranslations("shutdown");
  const lit = Math.min(streak, STREAK_DOTS);
  return (
    <div
      className="flex animate-up flex-col gap-3 rounded-2xl bg-fg p-[18px] text-bg"
      style={{ animationDelay: "240ms" }}
    >
      <span className="font-display text-[34px] leading-[41px] font-bold tabular-nums">
        {streak}
      </span>
      <span className="text-[13px] text-bg/80">
        {streak > 0 ? ts("streak", { n: streak }) : ts("streakNone")}
      </span>
      <div className="mt-auto flex gap-[5px]" aria-hidden>
        {Array.from({ length: STREAK_DOTS }, (_, i) => (
          <span
            key={i}
            style={{ animationDelay: `${300 + i * 50}ms` }}
            className={cn(
              // Shrink rather than overflow: 14 dots at 12px don't fit the
              // narrowest tile the auto-fit grid can produce.
              "aspect-square max-w-3 min-w-0 flex-1 animate-pop rounded-pill",
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
    <Well className="animate-up rounded-[28px]">
      <div className="flex flex-col gap-[18px] rounded-[22px] bg-surface p-5 shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06)] sm:p-7">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[28px] leading-[34px] font-bold tracking-[-0.02em] text-fg">
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
                  "flex h-[88px] min-w-0 cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[20px] px-1 transition-[background-color,color,transform,box-shadow] duration-250 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                  // The canvas's picked mood: white bars and word on the mint
                  // gradient, lifted 2px on a soft green shadow.
                  on
                    ? "-translate-y-0.5 bg-fit text-on-primary shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_30%,transparent)]"
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
                <span className="max-w-full truncate text-2xs font-semibold sm:text-xs">
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
      <div className="flex animate-up flex-col gap-1">
        <h2 className="font-display text-[28px] leading-[34px] font-bold tracking-[-0.02em] text-fg">
          {toToday ? ts("todayHeading") : ts("tomorrowHeading")}
        </h2>
        <p className="text-sm text-muted">
          {pending.length === 0 ? ts("nothingPending") : ts("pendingCount", { n: pending.length })}
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="flex animate-up items-center gap-3 rounded-2xl bg-surface-2 p-4 text-sm font-medium text-fg">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-pill bg-fit text-on-primary">
            <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </span>
          {ts("allClosed")}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {pending.map((t, i) => {
              const dest = carryDestination(plan, t.id);
              const channel = t.channel_id ? channelsById.get(t.channel_id) : undefined;
              return (
                <li
                  key={t.id}
                  className="flex animate-up flex-wrap items-center gap-3 rounded-2xl bg-surface-2 py-2 pr-2 pl-[18px]"
                  style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
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
                    <span className="shrink-0 font-mono text-2xs text-muted">
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
                          "h-[34px] cursor-pointer rounded-pill px-3.5 text-2xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                          dest === o.dest
                            ? "bg-surface text-fg"
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
              "flex animate-up flex-wrap items-center gap-x-3 gap-y-2 rounded-[20px] px-[18px] py-3.5",
              over ? "bg-accent-soft text-accent" : "bg-primary-soft text-fg",
            )}
            style={{ animationDelay: "200ms" }}
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
                // Same weight as the sentence, as on the canvas: the number is
                // already the only figure in it.
                b: (chunks) => <span>{chunks}</span>,
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
 *
 * Returns the label row and the bar as siblings, so the parent's gap spaces
 * them evenly (10px on the canvas) instead of a tight label glued to its bar.
 * The estimate is a flat grey, the worked time the fit gradient; both fill in
 * from zero, the second a beat after the first.
 */
export function CompareBar({
  label,
  min,
  max,
  tone,
  delayMs = 400,
}: {
  label: string;
  min: number;
  max: number;
  tone: "soft" | "solid";
  delayMs?: number;
}) {
  const pct = max > 0 ? (min / max) * 100 : 0;
  return (
    <>
      <div className="flex items-baseline justify-between gap-2 text-2xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-fg">{formatMinutes(min)}</span>
      </div>
      <div className="h-2.5 rounded-pill bg-border">
        <div
          className={cn(
            "h-full animate-fill rounded-pill transition-[width] duration-500",
            tone === "solid"
              ? "bg-linear-90 from-fit-from to-primary"
              : "bg-[color-mix(in_srgb,var(--muted)_30%,var(--border-strong))]",
          )}
          style={{ width: `${pct}%`, animationDelay: `${delayMs}ms` }}
        />
      </div>
    </>
  );
}
