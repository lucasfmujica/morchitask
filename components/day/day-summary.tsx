"use client";

import { motion } from "framer-motion";
import type { Task } from "@/lib/queries/types";
import { formatMinutes } from "@/lib/format";
import { EASE_OUT } from "@/lib/motion";

export function DaySummary({ tasks }: { tasks: Task[] }) {
  const total = tasks.length;
  if (total === 0) return null;

  const done = tasks.filter((t) => t.status === "done").length;
  const plannedMin = tasks.reduce((sum, t) => sum + (t.time_estimate_min ?? 0), 0);
  const pct = Math.round((done / total) * 100);

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        <span>
          {done} de {total} hechas
        </span>
        {plannedMin > 0 && <span>{formatMinutes(plannedMin)} planeadas</span>}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        />
      </div>
    </div>
  );
}
