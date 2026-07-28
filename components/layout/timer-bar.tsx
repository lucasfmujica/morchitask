"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Pause } from "lucide-react";
import { taskKeys } from "@/lib/queries/tasks";
import { useTaskDetail } from "@/lib/stores/task-detail";
import { formatClock } from "@/lib/format";
import { EASE_OUT } from "@/lib/motion";
import type { Task } from "@/lib/queries/types";
import { useGlobalTimers, type RunningTimer } from "@/components/tasks/use-task-timer";

/** How many pills fit comfortably before the stack starts eating the phone. */
const VISIBLE = 3;

/**
 * Floating pills shown while any task stopwatch is running, so they're always
 * one tap away (and never silently left running). Several tasks can be timed at
 * once, so they stack — with a "Detener todo" shortcut once there's more than
 * one. Tapping a title opens that task. Sits above the mobile bottom nav.
 */
export function TimerBar() {
  const { timers, count, stop, stopAll } = useGlobalTimers();
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();
  const openDetail = useTaskDetail((s) => s.open);

  function openTask(timer: RunningTimer) {
    const key = timer.plannedDate ? taskKeys.date(timer.plannedDate) : taskKeys.backlog;
    const task = qc.getQueryData<Task[]>(key)?.find((t) => t.id === timer.taskId);
    if (task) openDetail(task);
  }

  const hidden = expanded ? 0 : Math.max(0, count - VISIBLE);
  const shown = hidden > 0 ? timers.slice(0, VISIBLE) : timers;

  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1.5 md:bottom-6">
      <AnimatePresence initial={false}>
        {count > 1 && (
          <motion.button
            key="stop-all"
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            onClick={stopAll}
            className="pointer-events-auto inline-flex h-8 cursor-pointer items-center gap-1 rounded-pill border border-border bg-surface px-3.5 text-xs font-semibold text-danger shadow-card transition-colors hover:bg-danger/10"
          >
            <Pause className="h-3.5 w-3.5" aria-hidden />
            Detener todo ({count})
          </motion.button>
        )}

        {shown.map((timer) => (
          <motion.div
            key={timer.taskId}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="pointer-events-auto flex items-center gap-3 rounded-pill border border-border bg-surface py-1.5 pr-1.5 pl-3.5 shadow-card"
          >
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <button
              onClick={() => openTask(timer)}
              className="flex min-w-0 cursor-pointer items-center gap-2.5 text-left"
            >
              <span className="max-w-[40vw] truncate text-sm font-medium text-fg md:max-w-[16rem]">
                {timer.title}
              </span>
              <span className="text-sm font-bold tabular-nums text-primary">
                {formatClock(timer.elapsedSec)}
              </span>
            </button>
            <button
              onClick={() => stop(timer.taskId)}
              aria-label={`Detener cronómetro de ${timer.title}`}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-pill bg-danger/10 px-3 text-xs font-semibold text-danger transition-colors hover:bg-danger/15"
            >
              <Pause className="h-3.5 w-3.5" aria-hidden />
              Detener
            </button>
          </motion.div>
        ))}

        {hidden > 0 && (
          <motion.button
            key="more"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpanded(true)}
            className="pointer-events-auto cursor-pointer rounded-pill border border-border bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card transition-colors hover:text-fg"
          >
            +{hidden} más
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
