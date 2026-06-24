"use client";

import { useEffect, useState } from "react";
import { setTaskActiveSince, useSetActualTime } from "@/lib/queries/tasks";
import { elapsedSeconds, useActiveTimer } from "@/lib/stores/active-timer";
import type { Task } from "@/lib/queries/types";

/** True only after first client render — avoids SSR/hydration mismatches when a
 *  timer was already running (read from localStorage on the client). */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount flag
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** A live wall-clock in ms, refreshed every second while `on`. 0 until started,
 *  so nothing impure is read during render (the value comes from the tick). */
function useNow(on: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!on) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync to wall clock on (re)start
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

/** Stop the currently-running timer (if any), logging its elapsed time. */
function useStopActive() {
  const active = useActiveTimer((s) => s.active);
  const clear = useActiveTimer((s) => s.clear);
  const setActual = useSetActualTime();
  return () => {
    if (!active) return;
    const secs = elapsedSeconds(active.startedAt, Date.now());
    if (secs > 0) {
      // Store time in minutes, but fractional — so even a few seconds are kept.
      setActual.mutate({
        taskId: active.taskId,
        plannedDate: active.plannedDate,
        actualMin: active.baseActualMin + secs / 60,
      });
    }
    void setTaskActiveSince(active.taskId, false); // clear presence
    clear();
  };
}

/** Per-task stopwatch controls + live elapsed, for the card and detail sheet. */
export function useTaskTimer(task: Task) {
  const active = useActiveTimer((s) => s.active);
  const start = useActiveTimer((s) => s.start);
  const clear = useActiveTimer((s) => s.clear);
  const stopActive = useStopActive();
  const mounted = useMounted();

  const running = mounted && active?.taskId === task.id;
  const now = useNow(running);

  const elapsedSec =
    active && running && now ? Math.max(0, Math.floor((now - active.startedAt) / 1000)) : 0;
  // Total time on the task = already-logged time (minutes, fractional) + this live run.
  const liveSeconds = Math.round((task.actual_time_min ?? 0) * 60) + elapsedSec;

  function startTimer() {
    stopActive(); // only one task is timed at a time
    start({
      taskId: task.id,
      title: task.title,
      plannedDate: task.planned_date,
      baseActualMin: task.actual_time_min ?? 0,
      startedAt: Date.now(),
    });
    if (task.shared) void setTaskActiveSince(task.id, true); // let my partner see it
  }
  function stopTimer() {
    if (running) stopActive();
  }
  function toggle() {
    if (running) stopTimer();
    else startTimer();
  }
  /** Drop the timer without logging (e.g. the task is being deleted). */
  function cancel() {
    if (running) {
      void setTaskActiveSince(task.id, false);
      clear();
    }
  }

  return { running, elapsedSec, liveSeconds, toggle, startTimer, stopTimer, cancel };
}

/** Global running-timer state for the floating bar (no Task object needed). */
export function useGlobalTimer() {
  const active = useActiveTimer((s) => s.active);
  const stop = useStopActive();
  const mounted = useMounted();

  const on = mounted && !!active;
  const now = useNow(on);

  const elapsedSec = active && now ? Math.max(0, Math.floor((now - active.startedAt) / 1000)) : 0;
  return { active: on ? active : null, elapsedSec, stop };
}
