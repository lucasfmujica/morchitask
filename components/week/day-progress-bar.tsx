"use client";

import type { CSSProperties } from "react";
import { formatMinutes } from "@/lib/format";
import { capacityState } from "@/lib/capacity";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * How LOADED a day is, per column in the Week view.
 *
 * It used to track completed/total, which answered the wrong question here:
 * planning a week is about where the work fits, and a day at 0% done tells you
 * nothing about whether you can put anything else on it. This tracks planned
 * minutes against the daily capacity budget, so a full Thursday looks full
 * before you drop a fifth task on it.
 *
 * Drawn exactly as the canvas has it: one 6px bar that fills from the left on
 * mount (staggered per column), mint gradient while it fits, the hatched
 * overflow over budget, and a quiet grey once the day is closed and the
 * budget stops being the point.
 */

// Over budget the whole fill turns hatched, so "too much" reads without colour.
// The canvas's second stripe is #d9682f, which has no token yet; this mix is
// the closest themed stand-in.
const OVER_FILL =
  "repeating-linear-gradient(45deg, var(--accent) 0 5px, color-mix(in srgb, var(--accent) 70%, var(--marker)) 5px 10px)";
// The canvas's #9aa294: a settled grey between --subtle and --border-strong,
// mixed from both so it follows the theme.
const CLOSED_FILL = "color-mix(in srgb, var(--subtle) 38%, var(--border-strong))";

export function DayLoadBar({
  plannedMin,
  capacityMin,
  measuredMin = 0,
  closed = false,
  index = 0,
}: {
  plannedMin: number;
  capacityMin: number;
  /** Tracked minutes, shown instead of the budget once the day is closed. */
  measuredMin?: number;
  closed?: boolean;
  /** Column position, for the fill's staggered entrance. */
  index?: number;
}) {
  const t = useTranslations("week");
  const { pct, over, overByMin } = capacityState(plannedMin, capacityMin);
  const empty = plannedMin === 0;

  const fill: CSSProperties = {
    width: `${pct}%`,
    animationDuration: "1.1s",
    animationDelay: `${300 + index * 80}ms`,
    background: closed ? CLOSED_FILL : over ? OVER_FILL : undefined,
  };

  return (
    <>
      {/* Sits on the grey well, so the track is one step darker than it. */}
      <div className="h-1.5 overflow-hidden rounded-pill bg-border" aria-hidden>
        <div
          className={cn(
            "h-full animate-fill rounded-pill transition-[width] duration-300",
            !closed && !over && "bg-fit",
          )}
          style={fill}
        />
      </div>
      <span
        className={cn(
          "text-[11px] font-semibold tabular-nums",
          over && !closed ? "text-accent" : "text-muted",
        )}
      >
        {closed
          ? t("closed", { time: formatMinutes(measuredMin || plannedMin) })
          : empty
            ? t("noLoad")
            : over
              ? t("loadOver", {
                  planned: formatMinutes(plannedMin),
                  capacity: formatMinutes(capacityMin),
                  over: formatMinutes(overByMin),
                })
              : t("loadOf", {
                  planned: formatMinutes(plannedMin),
                  capacity: formatMinutes(capacityMin),
                })}
      </span>
    </>
  );
}
