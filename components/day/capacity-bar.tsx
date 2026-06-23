"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { formatMinutes } from "@/lib/format";
import { capacityState, DEFAULT_CAPACITY_MIN } from "@/lib/capacity";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

export { DEFAULT_CAPACITY_MIN };

/**
 * How full the day is: planned minutes vs the person's daily capacity budget.
 * Turns amber as it fills and red when over-planned, with a gentle nudge to
 * trim or push work to tomorrow. Used in the Day view and the morning plan.
 */
export function CapacityBar({
  plannedMin,
  targetMin = DEFAULT_CAPACITY_MIN,
}: {
  plannedMin: number;
  targetMin?: number;
}) {
  if (targetMin <= 0) return null;

  const { pct, over, near, overByMin } = capacityState(plannedMin, targetMin);
  const fill = over ? "bg-danger" : near ? "bg-warning" : "bg-primary";

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        <span>Capacidad del día</span>
        <span className={cn(over && "text-danger", near && "text-warning")}>
          {formatMinutes(plannedMin)} / {formatMinutes(targetMin)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className={cn("h-full rounded-full", fill)}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        />
      </div>
      {over && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-danger">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Te pasaste por {formatMinutes(overByMin)} — sacá algo o movelo a mañana.
        </p>
      )}
    </div>
  );
}
