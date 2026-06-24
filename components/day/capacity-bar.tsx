"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check, Minus, Plus } from "lucide-react";
import { formatMinutes } from "@/lib/format";
import {
  CAPACITY_MAX_MIN,
  CAPACITY_MIN_MIN,
  CAPACITY_STEP_MIN,
  capacityState,
  clampCapacity,
  DEFAULT_CAPACITY_MIN,
} from "@/lib/capacity";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

export { DEFAULT_CAPACITY_MIN };

/**
 * How full the day is: planned minutes vs the person's daily capacity budget.
 * Turns amber as it fills and red when over-planned, with a gentle nudge to
 * trim or push work to tomorrow. Used in the Day view and the morning plan.
 *
 * Pass `onTargetChange` to let the person tune this day's capacity inline.
 */
export function CapacityBar({
  plannedMin,
  targetMin = DEFAULT_CAPACITY_MIN,
  onTargetChange,
}: {
  plannedMin: number;
  targetMin?: number;
  onTargetChange?: (min: number) => void;
}) {
  if (targetMin <= 0) return null;

  const { pct, over, near, overByMin } = capacityState(plannedMin, targetMin);
  const fill = over ? "bg-danger" : near ? "bg-warning" : "bg-primary";
  const accent = cn(over && "text-danger", near && "text-warning");

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        <span>Capacidad del día</span>
        <span className={cn("flex items-center gap-1", accent)}>
          {formatMinutes(plannedMin)} /{" "}
          {onTargetChange ? (
            <CapacityTarget value={targetMin} onChange={onTargetChange} accent={accent} />
          ) : (
            formatMinutes(targetMin)
          )}
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

/**
 * The target portion of the bar, tappable to adjust this day's capacity in
 * half-hour steps. Each step saves immediately; the check just collapses it.
 */
function CapacityTarget({
  value,
  onChange,
  accent,
}: {
  value: number;
  onChange: (min: number) => void;
  accent?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Ajustar la capacidad de hoy"
        className={cn(
          "cursor-pointer rounded underline decoration-dotted decoration-from-font underline-offset-2 transition-colors hover:text-fg",
          accent,
        )}
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
        aria-label="Bajar capacidad"
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
        aria-label="Subir capacidad"
        className={btn}
      >
        <Plus className="h-3 w-3" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        aria-label="Listo"
        className={cn(btn, "bg-primary-soft text-primary hover:bg-primary/15")}
      >
        <Check className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}
