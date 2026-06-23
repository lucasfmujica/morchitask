"use client";

import { motion } from "framer-motion";
import { completionPct } from "@/lib/week-filter";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Thin per-day completion bar for the Week columns. Fills as the day's tasks
 * get checked off and turns green at 100%. Mirrors the Day view's CapacityBar
 * motion, but tracks completed/total instead of capacity.
 */
export function DayProgressBar({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;

  const pct = completionPct(done, total);
  const complete = done >= total;

  return (
    <div
      className="h-1 overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={`${done} de ${total} tareas completadas`}
    >
      <motion.div
        className={cn("h-full rounded-full", complete ? "bg-success" : "bg-primary")}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      />
    </div>
  );
}
