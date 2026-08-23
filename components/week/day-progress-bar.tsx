"use client";

import { motion } from "framer-motion";
import { formatMinutes } from "@/lib/format";
import { capacityState } from "@/lib/capacity";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * How LOADED a day is, per column in the Week view.
 *
 * It used to track completed/total, which answered the wrong question here:
 * planning a week is about where the work fits, and a day at 0% done tells you
 * nothing about whether you can put anything else on it. This tracks planned
 * minutes against the daily capacity budget, so a full Thursday looks full
 * before you drop a fifth task on it.
 *
 * A closed day is settled — it reads green with what it actually took, and the
 * budget stops being the point.
 */
export function DayLoadBar({
  plannedMin,
  capacityMin,
  measuredMin = 0,
  closed = false,
}: {
  plannedMin: number;
  capacityMin: number;
  /** Tracked minutes, shown instead of the budget once the day is closed. */
  measuredMin?: number;
  closed?: boolean;
}) {
  const { pct, over, overByMin } = capacityState(plannedMin, capacityMin);
  const empty = plannedMin === 0;
  // While over, the fill stops at the budget and the mark shows where that was
  // — same grammar as the day's capacity band.
  const targetPct = over ? (capacityMin / plannedMin) * 100 : pct;

  return (
    <div>
      <div className="relative h-1.5 rounded-pill bg-surface-2">
        <motion.div
          className={cn(
            "absolute inset-y-0 left-0 rounded-pill",
            closed ? "bg-success" : over ? "bg-danger" : "bg-primary",
          )}
          initial={false}
          animate={{ width: `${closed ? 100 : over ? 100 : pct}%` }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        />
        {over && !closed && (
          <span
            className="absolute -top-[2px] -bottom-[2px] w-[2px] bg-fg/50"
            style={{ left: `${targetPct}%` }}
            aria-hidden
          />
        )}
      </div>
      <p
        className={cn(
          "mt-1.5 text-2xs font-semibold",
          closed ? "text-success" : over ? "text-danger" : "text-muted",
        )}
      >
        {closed
          ? `${formatMinutes(measuredMin || plannedMin)} · cerrado`
          : empty
            ? "Sin carga"
            : `${formatMinutes(plannedMin)} de ${formatMinutes(capacityMin)}${
                over ? ` · +${formatMinutes(overByMin)}` : ""
              }`}
      </p>
    </div>
  );
}
