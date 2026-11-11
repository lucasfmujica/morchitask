"use client";

import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { formatMinutes } from "@/lib/format";
import {
  CAPACITY_MAX_MIN,
  CAPACITY_MIN_MIN,
  CAPACITY_STEP_MIN,
  capacityState,
  capacitySuggestion,
  clampCapacity,
  DEFAULT_CAPACITY_MIN,
} from "@/lib/capacity";
import { WORK_GOAL_MIN, workedState } from "@/lib/worked";
import type { Task } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { useTranslations } from "next-intl";

export { DEFAULT_CAPACITY_MIN };

/**
 * The day's tile at the top of Hoy: what you WORKED, against the 5h goal, with
 * the plan underneath in small type.
 *
 * It used to lead with planned time against the capacity budget. Only one of
 * the two people who use this plans; the other mostly just works, so a bar fed
 * by estimates said nothing about her day. Worked time has an answer every
 * day, so it got the big number and the bar.
 *
 * - The bar fills to the goal and stops: past 5h it is simply full, in the
 *   same mint, with "Llegaste a las 5h". Working more than the goal is not a
 *   failure, so there is no red and no overrun stretch here any more.
 * - Planning stays one line down, because it still matters to whoever plans:
 *   the capacity target is still editable there, and an over-planned day
 *   still names the task to move and offers the button. Over-planning is said
 *   in words, never by colour alone.
 */
export function CapacityBar({
  tasks = [],
  workedMin,
  goalMin = WORK_GOAL_MIN,
  isToday = true,
  isFuture = false,
  plannedMin,
  targetMin = DEFAULT_CAPACITY_MIN,
  onTargetChange,
  onMoveOverflow,
  className,
}: {
  /** The day's tasks: the done count, and the one worth moving when over-planned. */
  tasks?: readonly Task[];
  /** Minutes I tracked on this day (from the per-day entries). */
  workedMin: number;
  goalMin?: number;
  /** Today gets "te faltan…"; a past day just shows what it was. */
  isToday?: boolean;
  /** A future day has no worked time yet: the bar stays empty and quiet. */
  isFuture?: boolean;
  plannedMin: number;
  targetMin?: number;
  onTargetChange?: (min: number) => void;
  /** Move the suggested task to tomorrow. Without it, no button is offered. */
  onMoveOverflow?: (task: Task) => void;
  className?: string;
}) {
  const t = useTranslations("day");
  const worked = isFuture ? 0 : workedMin;
  const { pct, reached, leftMin } = workedState(worked, goalMin);
  const { over, overByMin } = capacityState(plannedMin, targetMin);
  const suggestion = capacitySuggestion(tasks, plannedMin, targetMin);
  const doneCount = tasks.filter((t) => t.status === "done").length;

  const goal = () =>
    onTargetChange ? (
      <CapacityTarget value={targetMin} onChange={onTargetChange} />
    ) : (
      <span>{formatMinutes(targetMin)}</span>
    );

  return (
    <section
      aria-label={t("dayProgress")}
      className={cn("rounded-[28px] bg-surface-2 p-2", className)}
    >
      <div className="flex flex-wrap items-center gap-5 rounded-[22px] bg-surface px-5 py-[18px] shadow-tile">
        {/* The number is the point: how much of the day you already put in. */}
        <div className="flex flex-col gap-0.5">
          <span className="text-2xs text-muted">{t("worked")}</span>
          <span className="flex items-baseline gap-1.5 whitespace-nowrap tabular-nums">
            {t.rich("workedOf", {
              worked: formatMinutes(worked),
              goal: formatMinutes(goalMin),
              big: (chunks) => (
                <span className="font-display text-[30px] leading-9 font-bold tracking-[-0.02em]">
                  {chunks}
                </span>
              ),
              small: (chunks) => (
                <span className="text-base font-semibold text-muted">{chunks}</span>
              ),
            })}
          </span>
        </div>

        <div className="flex flex-[1_1_260px] flex-col gap-2">
          <div
            className="relative h-2.5 overflow-hidden rounded-pill bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goalMin}
            aria-valuenow={Math.min(Math.round(worked), goalMin)}
            aria-valuetext={t("workedOfGoal", {
              worked: formatMinutes(worked),
              goal: formatMinutes(goalMin),
            })}
          >
            <div
              className="h-full animate-fill rounded-pill bg-fit transition-[width] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-2xs">
            {reached ? (
              <span className="flex items-center gap-1.5 font-semibold text-primary">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                {t("goalReached", { goal: formatMinutes(goalMin) })}
              </span>
            ) : isToday && !isFuture ? (
              <span className="font-semibold text-primary">
                {t("goalLeft", { left: formatMinutes(leftMin), goal: formatMinutes(goalMin) })}
              </span>
            ) : (
              <span />
            )}
            <span className="text-muted tabular-nums">
              {t("doneOfTotal", { done: doneCount, total: tasks.length })}
            </span>
          </div>

          {/* The plan, kept but quiet. Over budget the sentence says so and
              the next line offers the move: one message per case, since the
              emphasised words move in another language. */}
          {targetMin > 0 && (
            <p className="text-2xs text-muted tabular-nums">
              {t.rich(over ? "plannedLineOver" : "plannedLine", {
                planned: formatMinutes(plannedMin),
                target: formatMinutes(targetMin),
                over: formatMinutes(overByMin),
                goal,
                warn: (chunks) => <span className="font-semibold text-accent">{chunks}</span>,
              })}
            </p>
          )}
          {over && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs text-muted">
              <p className="min-w-0 flex-1">
                {suggestion?.task
                  ? t.rich("overMoveSuggestion", {
                      title: suggestion.task.title,
                      b: (chunks) => <span className="font-semibold text-fg">{chunks}</span>,
                    })
                  : t("overGeneric")}
              </p>
              {suggestion?.task && onMoveOverflow && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onMoveOverflow(suggestion.task!)}
                >
                  {t("moveAmount", {
                    time: formatMinutes(suggestion.task.time_estimate_min ?? overByMin),
                  })}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The target portion of the band, tappable to adjust this day's capacity in
 * half-hour steps. Each step saves immediately; the check just collapses it.
 */
function CapacityTarget({ value, onChange }: { value: number; onChange: (min: number) => void }) {
  const t = useTranslations("day");
  const tb = useTranslations("backlog");
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={t("adjustCapacity")}
        className="cursor-pointer rounded tabular-nums underline decoration-dotted decoration-from-font underline-offset-2 transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        {formatMinutes(value)}
      </button>
    );
  }

  const step = (delta: number) => onChange(clampCapacity(value + delta));
  const btn =
    "inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-border hover:text-fg disabled:cursor-default disabled:opacity-40";

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => step(-CAPACITY_STEP_MIN)}
        disabled={value <= CAPACITY_MIN_MIN}
        aria-label={t("lowerCapacity")}
        className={btn}
      >
        <Minus className="h-3 w-3" aria-hidden />
      </button>
      <span className="min-w-[2.75rem] text-center tabular-nums text-fg">
        {formatMinutes(value)}
      </span>
      <button
        type="button"
        onClick={() => step(CAPACITY_STEP_MIN)}
        disabled={value >= CAPACITY_MAX_MIN}
        aria-label={t("raiseCapacity")}
        className={btn}
      >
        <Plus className="h-3 w-3" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        aria-label={tb("doneEstimating")}
        className={cn(btn, "bg-primary-soft text-primary hover:bg-primary/15")}
      >
        <Check className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}
