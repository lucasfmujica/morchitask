"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Pause } from "lucide-react";
import { taskKeys } from "@/lib/queries/tasks";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { formatClock } from "@/lib/format";
import type { Task } from "@/lib/queries/types";
import { useGlobalTimer } from "@/components/tasks/use-task-timer";

/**
 * Floating pill shown whenever a task stopwatch is running, so it's always one
 * tap away (and never silently left running). Tapping the title opens the task;
 * the stop button logs the elapsed time. Sits above the mobile bottom nav.
 */
export function TimerBar() {
  const { active, elapsedSec, stop } = useGlobalTimer();
  const qc = useQueryClient();
  const openDetail = useTaskDetail((s) => s.open);

  function openTask() {
    if (!active) return;
    const key = active.plannedDate ? taskKeys.date(active.plannedDate) : taskKeys.backlog;
    const task = qc.getQueryData<Task[]>(key)?.find((t) => t.id === active.taskId);
    if (task) openDetail(task);
  }

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 md:bottom-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-3 rounded-pill border border-border bg-surface py-1.5 pr-1.5 pl-3.5 shadow-card">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <button
              onClick={openTask}
              className="flex min-w-0 cursor-pointer items-center gap-2.5 text-left"
            >
              <span className="max-w-[40vw] truncate text-sm font-medium text-fg md:max-w-[16rem]">
                {active.title}
              </span>
              <span className="text-sm font-bold tabular-nums text-primary">
                {formatClock(elapsedSec)}
              </span>
            </button>
            <button
              onClick={stop}
              aria-label="Detener cronómetro"
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-pill bg-danger/10 px-3 text-xs font-semibold text-danger transition-colors hover:bg-danger/15"
            >
              <Pause className="h-3.5 w-3.5" aria-hidden />
              Detener
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
