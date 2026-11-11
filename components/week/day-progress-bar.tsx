"use client";

import type { CSSProperties } from "react";
import { formatMinutes } from "@/lib/format";
import { capacityState } from "@/lib/capacity";
import { workedState } from "@/lib/worked";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * How much of each day you WORKED, per column in the Week view.
 *
 * It used to track planned minutes against the capacity budget, with a hatched
 * overrun. That only spoke to whoever plans; the bar now draws tracked time
 * against the daily goal (5h), which every past day and today has an answer
 * to. Reaching the goal fills it in the same mint: more than the goal is not
 * an error, so there is no hatch any more.
 *
 * A future day has no worked time by definition. Its bar stays empty and the
 * plan moves into the label ("Planeado 3h 30m"), still flagged in words when
 * it runs past the budget, so planning a week is not left blind.
 *
 * Drawn as the canvas has it: one 6px bar that fills from the left on mount
 * (staggered per column), and a quiet grey once the day is closed.
 */

// The canvas's #9aa294: a settled grey between --subtle and --border-strong,
// mixed from both so it follows the theme.
const CLOSED_FILL = "color-mix(in srgb, var(--subtle) 38%, var(--border-strong))";

export function DayWorkedBar({
  workedMin,
  goalMin,
  plannedMin,
  capacityMin,
  future = false,
  closed = false,
  index = 0,
}: {
  /** Minutes I tracked that day. */
  workedMin: number;
  goalMin: number;
  /** Only read for future days, where it becomes the label. */
  plannedMin: number;
  capacityMin: number;
  future?: boolean;
  closed?: boolean;
  /** Column position, for the fill's staggered entrance. */
  index?: number;
}) {
  const t = useTranslations("week");
  const { pct, reached } = workedState(future ? 0 : workedMin, goalMin);
  const plan = capacityState(plannedMin, capacityMin);

  const fill: CSSProperties = {
    width: `${pct}%`,
    animationDuration: "1.1s",
    animationDelay: `${300 + index * 80}ms`,
    background: closed ? CLOSED_FILL : undefined,
  };
  const worked = { worked: formatMinutes(workedMin), goal: formatMinutes(goalMin) };

  return (
    <>
      {/* Sits on the grey well, so the track is one step darker than it. */}
      <div className="h-1.5 overflow-hidden rounded-pill bg-border" aria-hidden>
        <div
          className={cn(
            "h-full animate-fill rounded-pill transition-[width] duration-300",
            !closed && "bg-fit",
          )}
          style={fill}
        />
      </div>
      <span
        className={cn(
          "text-[11px] font-semibold tabular-nums",
          future && plan.over ? "text-accent" : reached && !closed ? "text-primary" : "text-muted",
        )}
      >
        {future
          ? plannedMin === 0
            ? t("noLoad")
            : plan.over
              ? t("plannedOver", {
                  planned: formatMinutes(plannedMin),
                  over: formatMinutes(plan.overByMin),
                })
              : t("plannedOnly", { planned: formatMinutes(plannedMin) })
          : closed
            ? t("workedClosed", worked)
            : t("workedOf", worked)}
      </span>
    </>
  );
}
