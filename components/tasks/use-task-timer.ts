"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { setTaskActiveSince, useAddActualTime } from "@/lib/queries/tasks";
import { elapsedSeconds, useActiveTimers, type ActiveTimer } from "@/lib/stores/active-timer";
import type { Task } from "@/lib/queries/types";

/** True only after first client render — avoids SSR/hydration mismatches when a
 *  timer was already running (read from localStorage on the client). */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount flag
  useEffect(() => setMounted(true), []);
  return mounted;
}

// ---------------------------------------------------------------------------
// One shared 1s ticker for every running timer on the page. With N stopwatches
// this is still a single interval, and it's torn down when the last subscriber
// unmounts. Elapsed time is always derived from `Date.now() - startedAt`, so
// background-tab throttling costs refresh rate, never accuracy.
// ---------------------------------------------------------------------------
const ticker = {
  now: 0,
  listeners: new Set<() => void>(),
  handle: null as ReturnType<typeof setInterval> | null,
};

function subscribeTick(listener: () => void) {
  ticker.listeners.add(listener);
  if (!ticker.handle) {
    ticker.now = Date.now();
    ticker.handle = setInterval(() => {
      ticker.now = Date.now();
      for (const fn of ticker.listeners) fn();
    }, 1000);
  }
  return () => {
    ticker.listeners.delete(listener);
    if (ticker.listeners.size === 0 && ticker.handle) {
      clearInterval(ticker.handle);
      ticker.handle = null;
    }
  };
}

const noopSubscribe = () => () => {};
const zero = () => 0;

/** Live wall clock in ms, refreshed every second while `on`. 0 when off and
 *  during SSR, so nothing impure is read during render. */
function useNow(on: boolean): number {
  return useSyncExternalStore(
    on ? subscribeTick : noopSubscribe,
    on ? () => ticker.now : zero,
    zero,
  );
}

/** Stop one timer by id, logging its elapsed time onto the task. */
function useTimerStopper() {
  const addActual = useAddActualTime();
  return useCallback(
    (taskId: string) => {
      const { timers, stop } = useActiveTimers.getState();
      const t = timers[taskId];
      if (!t) return;
      const secs = elapsedSeconds(t.startedAt, Date.now());
      // Added, not overwritten: an absolute write would clobber a manual edit
      // made mid-run, or another device's stop.
      if (secs > 0) {
        addActual.mutate({ taskId, plannedDate: t.plannedDate, deltaMin: secs / 60 });
      }
      void setTaskActiveSince(taskId, false); // clear presence
      stop(taskId);
    },
    [addActual],
  );
}

/** Per-task stopwatch controls + live elapsed, for the card and detail sheet. */
export function useTaskTimer(task: Task) {
  // Select this task's entry only — selecting the whole record would re-render
  // every card on screen whenever any timer starts or stops.
  const timer = useActiveTimers((s) => s.timers[task.id]);
  const start = useActiveTimers((s) => s.start);
  const stopOne = useTimerStopper();
  const mounted = useMounted();

  const running = mounted && !!timer;
  const now = useNow(running);

  const elapsedSec = timer && running && now ? elapsedSeconds(timer.startedAt, now) : 0;
  // Total time on the task = already-logged time (minutes, fractional) + this live run.
  const liveSeconds = Math.round((task.actual_time_min ?? 0) * 60) + elapsedSec;

  function startTimer() {
    // No stopping of other timers — running several at once is the point.
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
    if (running) stopOne(task.id);
  }
  function toggle() {
    if (running) stopTimer();
    else startTimer();
  }
  /** Drop this task's timer without logging (e.g. the task is being deleted). */
  function cancel() {
    if (!running) return;
    void setTaskActiveSince(task.id, false);
    useActiveTimers.getState().stop(task.id);
  }

  return { running, elapsedSec, liveSeconds, toggle, startTimer, stopTimer, cancel };
}

export type RunningTimer = ActiveTimer & { elapsedSec: number };

/** Every running stopwatch, for the floating bar (no Task objects needed). */
export function useGlobalTimers() {
  // zustand v5 does no shallow compare, so the selector must return the stable
  // record; deriving a fresh array inside it would loop on getSnapshot.
  const timers = useActiveTimers((s) => s.timers);
  const stop = useTimerStopper();
  const mounted = useMounted();

  // Oldest first, so a new timer appends instead of reshuffling the stack.
  const list = useMemo(
    () => Object.values(timers).sort((a, b) => a.startedAt - b.startedAt),
    [timers],
  );
  const on = mounted && list.length > 0;
  const now = useNow(on);

  const running: RunningTimer[] = useMemo(
    () =>
      on ? list.map((t) => ({ ...t, elapsedSec: now ? elapsedSeconds(t.startedAt, now) : 0 })) : [],
    [on, list, now],
  );

  const stopAll = useCallback(() => {
    for (const id of Object.keys(useActiveTimers.getState().timers)) stop(id);
  }, [stop]);

  return { timers: running, count: running.length, stop, stopAll };
}
