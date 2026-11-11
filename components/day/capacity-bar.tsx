"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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
import type { Task } from "@/lib/queries/types";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { useTranslations } from "next-intl";

export { DEFAULT_CAPACITY_MIN };

/**
 * The day's capacity, as the bento tile at the top of Hoy: the planned time as
 * a big number, the bar beside it.
 *
 * It replaces the old pair of thin bars (capacity + completion). The completion
 * count moved next to the list tabs, because the two answered different
 * questions and stacking them made both easy to ignore.
 *
 * What makes this one hard to ignore when it matters:
 *
 * - the bar SPLITS at the target — the overrun is drawn OUTSIDE the budget as
 *   a hatched stretch rather than a full bar that has simply turned red, so
 *   you can see how much too much it is;
 * - the diagnosis names a task and the button acts on it, so "you're over" has
 *   a next move instead of being a verdict;
 * - over-budget is never signalled by colour alone (there's a `+45m` chip and
 *   the sentence), which is what makes it readable without colour vision.
 */
export function CapacityBar({
  tasks = [],
  plannedMin,
  targetMin = DEFAULT_CAPACITY_MIN,
  onTargetChange,
  onMoveOverflow,
  className,
}: {
  /** The day's tasks — used to name the one worth moving. */
  tasks?: readonly Task[];
  plannedMin: number;
  targetMin?: number;
  onTargetChange?: (min: number) => void;
  /** Move the suggested task to tomorrow. Without it, no button is offered. */
  onMoveOverflow?: (task: Task) => void;
  className?: string;
}) {
  const t = useTranslations("day");
  if (targetMin <= 0) return null;

  const { pct, over, near, overByMin } = capacityState(plannedMin, targetMin);
  const suggestion = capacitySuggestion(tasks, plannedMin, targetMin);
  const pendingCount = tasks.filter((t) => t.status !== "done").length;
  // Where the budget ends, as a share of everything planned. Only meaningful
  // while over — that's the only time the bar runs past the target.
  const targetPct = over ? (targetMin / plannedMin) * 100 : 100;

  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <section aria-label={t("capacity")} className={cn("rounded-2xl bg-surface-2 p-2", className)}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-surface px-5 py-4 shadow-soft">
        {/* The number is the point: how much of the day is already spoken for. */}
        <div className="flex flex-col">
          <span className="text-xs text-muted">{t("planned")}</span>
          <span
            className={cn("flex items-baseline gap-1.5 whitespace-nowrap", over && "text-danger")}
          >
            {t.rich("plannedOf", {
              planned: formatMinutes(plannedMin),
              target: formatMinutes(targetMin),
              big: (chunks) => (
                <span className="font-display text-[28px] leading-8 font-bold tracking-tight">
                  {chunks}
                </span>
              ),
              small: (chunks) => <span className="text-sm font-semibold text-muted">{chunks}</span>,
              goal: () =>
                onTargetChange ? (
                  <CapacityTarget value={targetMin} onChange={onTargetChange} />
                ) : (
                  <span>{formatMinutes(targetMin)}</span>
                ),
            })}
          </span>
        </div>

        <div className="flex min-w-[240px] flex-1 flex-col gap-2">
          {/* Under budget it's one fill; over, it splits at the target and the
              overrun is drawn outside the budget as a hatched stretch. */}
          <div className="relative h-2.5 rounded-pill bg-surface-2">
            <motion.div
              className={cn(
                "absolute inset-y-0 left-0 rounded-pill",
                over ? "rounded-r-none bg-fit" : near ? "bg-warning" : "bg-fit",
              )}
              initial={false}
              animate={{ width: `${over ? targetPct : pct}%` }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            />
            {over && (
              <>
                <motion.div
                  className="absolute inset-y-0 rounded-r-pill"
                  initial={false}
                  animate={{ left: `${targetPct}%`, width: `${100 - targetPct}%` }}
                  transition={{ duration: 0.4, ease: EASE_OUT }}
                  style={{
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
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            {over ? (
              <p className="min-w-0 text-fg">
                <span className="font-semibold text-danger">
                  {t("overBy", { over: formatMinutes(overByMin) })}
                </span>{" "}
                {/* One message per case, not a shared prefix plus a glued tail:
                    the emphasised word moves in another language. */}
                {suggestion?.task
                  ? t.rich("overMoveSuggestion", {
                      title: suggestion.task.title,
                      b: (chunks) => <span className="font-semibold">{chunks}</span>,
                    })
                  : t("overGeneric")}
              </p>
            ) : (
              <p className="font-semibold text-primary">
                {t("leftOver", { time: formatMinutes(targetMin - plannedMin), n: pendingCount })}
              </p>
            )}
            <span className="text-muted tabular-nums">
              {t("doneOfTotal", { done: doneCount, total: tasks.length })}
            </span>
          </div>
        </div>

        {over && suggestion?.task && onMoveOverflow && (
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
