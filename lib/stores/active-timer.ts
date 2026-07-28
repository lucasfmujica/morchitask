import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The running stopwatches. Several tasks can be timed at once — you're often
 * doing two things in parallel — so they live in a record keyed by task id:
 * `timers[task.id]` is an O(1), referentially stable lookup (every task card
 * calls it), and a task can't be started twice.
 *
 * Persisted to localStorage so running timers survive reloads / navigation on
 * the device. `baseActualMin` is the task's actual_time_min when the timer
 * started; the stop path adds the elapsed time on top of the live DB value.
 */
export type ActiveTimer = {
  taskId: string;
  title: string;
  plannedDate: string | null;
  baseActualMin: number;
  startedAt: number; // epoch ms
};

type State = {
  timers: Record<string, ActiveTimer>;
  start: (timer: ActiveTimer) => void;
  /** Remove one timer. Logging its time is the caller's job (see useTaskTimer). */
  stop: (taskId: string) => void;
  clearAll: () => void;
};

export const useActiveTimers = create<State>()(
  persist(
    (set) => ({
      timers: {},
      // Idempotent: re-starting an already-running task must NOT reset
      // startedAt, or a double tap silently discards the elapsed time.
      start: (timer) =>
        set((s) =>
          s.timers[timer.taskId] ? s : { timers: { ...s.timers, [timer.taskId]: timer } },
        ),
      stop: (taskId) =>
        set((s) => {
          if (!s.timers[taskId]) return s;
          const next = { ...s.timers };
          delete next[taskId];
          return { timers: next };
        }),
      clearAll: () => set({ timers: {} }),
    }),
    { name: "morchitask:active-timer", version: 1, migrate: migrateActiveTimers },
  ),
);

function isTimer(value: unknown): value is ActiveTimer {
  const t = value as ActiveTimer | null;
  return !!t && typeof t.taskId === "string" && typeof t.startedAt === "number";
}

/**
 * v0 stored a single `{ active: ActiveTimer | null }`. Keeping the same storage
 * key means a timer that was running when this shipped keeps ticking — it just
 * becomes the first entry of the record.
 */
export function migrateActiveTimers(
  persisted: unknown,
  version: number,
): { timers: Record<string, ActiveTimer> } {
  if (version >= 1) {
    const timers = (persisted as { timers?: unknown } | null)?.timers;
    if (!timers || typeof timers !== "object") return { timers: {} };
    const kept: Record<string, ActiveTimer> = {};
    for (const [id, t] of Object.entries(timers as Record<string, unknown>)) {
      if (isTimer(t)) kept[id] = t;
    }
    return { timers: kept };
  }
  const legacy = (persisted as { active?: unknown } | null)?.active;
  return isTimer(legacy) ? { timers: { [legacy.taskId]: legacy } } : { timers: {} };
}

/** Whole seconds elapsed between a start instant and now (floored). Pure → tested. */
export function elapsedSeconds(startedAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}
