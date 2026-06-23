import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The one task currently being timed (a running stopwatch). Persisted to
 * localStorage so a running timer survives reloads / navigation on the device.
 * `baseActualMin` is the task's actual_time_min captured when the timer started;
 * on stop we write `baseActualMin + elapsed` back to the task.
 */
export type ActiveTimer = {
  taskId: string;
  title: string;
  plannedDate: string | null;
  baseActualMin: number;
  startedAt: number; // epoch ms
};

type State = {
  active: ActiveTimer | null;
  start: (timer: ActiveTimer) => void;
  clear: () => void;
};

export const useActiveTimer = create<State>()(
  persist(
    (set) => ({
      active: null,
      start: (timer) => set({ active: timer }),
      clear: () => set({ active: null }),
    }),
    { name: "morchitask:active-timer" },
  ),
);

/** Whole minutes elapsed between a start instant and now (rounded). Pure → tested. */
export function elapsedMinutes(startedAtMs: number, nowMs: number): number {
  return Math.max(0, Math.round((nowMs - startedAtMs) / 60_000));
}
