import type { Task } from "@/lib/queries/types";

/**
 * The numbers behind the end-of-day ritual.
 *
 * Pulled out of the view because the old screen got this wrong in a way that
 * mattered: it summed `time_estimate_min` and called it "tiempo hecho". The app
 * tracks REAL time with the stopwatches (`actual_time_min`) and that was simply
 * never shown — which threw away the estimate-vs-actual feedback loop that is
 * the whole point of closing the day.
 */

export type ShutdownSummary = {
  done: Task[];
  pending: Task[];
  /** Estimated minutes for the tasks that got finished. */
  estimatedMin: number;
  /** Actually tracked minutes for those same tasks. */
  actualMin: number;
  /**
   * actual / estimated for the finished tasks: 1 means you nailed it, 1.4 means
   * things took 40% longer than you thought. `null` when nothing was estimated
   * (or nothing tracked) — there's no honest ratio to show.
   */
  accuracy: number | null;
};

export function shutdownSummary(tasks: Task[], meId: string): ShutdownSummary {
  const mine = tasks.filter((t) => t.owner_id === meId);
  const done = mine.filter((t) => t.status === "done");
  const pending = mine.filter((t) => t.status !== "done");

  const estimatedMin = done.reduce((sum, t) => sum + (t.time_estimate_min ?? 0), 0);
  const actualMin = done.reduce((sum, t) => sum + (t.actual_time_min ?? 0), 0);

  return {
    done,
    pending,
    estimatedMin,
    actualMin,
    accuracy: estimatedMin > 0 && actualMin > 0 ? actualMin / estimatedMin : null,
  };
}

/**
 * How the day went against the estimate, as a catalog key plus the number to
 * put in it. Within 10% counts as on target — false precision here would just
 * be noise, and "on target" carries no percentage at all, which is why this
 * returns a shape rather than three separate helpers.
 */
export function accuracyLabelKey(
  accuracy: number | null,
): { key: "accuracyOnTarget" | "accuracySlower" | "accuracyFaster"; pct: number } | null {
  if (accuracy === null) return null;
  if (accuracy >= 0.9 && accuracy <= 1.1) return { key: "accuracyOnTarget", pct: 0 };
  const pct = Math.round(Math.abs(accuracy - 1) * 100);
  return { key: accuracy > 1 ? "accuracySlower" : "accuracyFaster", pct };
}

/** The five moods, stored as 1..5 in `daily_notes.mood` — no migration needed.
 *  Words rather than bare numbers: "3 de 5" tells you nothing a month later.
 *  `labelKey` indexes the `shutdown` catalog; the emoji needs no translating. */
export const MOODS = [
  { value: 1, labelKey: "moodHard", emoji: "😩" },
  { value: 2, labelKey: "moodMeh", emoji: "😕" },
  { value: 3, labelKey: "moodNormal", emoji: "😐" },
  { value: 4, labelKey: "moodGood", emoji: "🙂" },
  { value: 5, labelKey: "moodGreat", emoji: "😄" },
] as const;

/**
 * Where each unfinished task goes when the day closes.
 *
 * The old ritual was all-or-nothing: every pending task rolled over to
 * tomorrow. That quietly rebuilt an over-full day every night. Now each task
 * carries its own destination and the CTA applies the map.
 */
export type CarryDestination = "tomorrow" | "backlog";
export type CarryPlan = Record<string, CarryDestination>;

/** Everything rolls over unless you say otherwise — the gentler default. */
export function defaultCarryPlan(pending: readonly Task[]): CarryPlan {
  return Object.fromEntries(pending.map((t) => [t.id, "tomorrow" as const]));
}

export function carryDestination(plan: CarryPlan, taskId: string): CarryDestination {
  return plan[taskId] ?? "tomorrow";
}

/** Split the pending tasks by where the plan sends them. */
export function splitByDestination(
  pending: readonly Task[],
  plan: CarryPlan,
): { toTomorrow: Task[]; toBacklog: Task[] } {
  const toTomorrow: Task[] = [];
  const toBacklog: Task[] = [];
  for (const t of pending) {
    (carryDestination(plan, t.id) === "backlog" ? toBacklog : toTomorrow).push(t);
  }
  return { toTomorrow, toBacklog };
}

/**
 * What tomorrow would weigh once this plan is applied: whatever is already
 * planned for tomorrow plus the estimates of everything rolling over.
 */
export function projectedTomorrowMin(
  pending: readonly Task[],
  plan: CarryPlan,
  tomorrowPlannedMin = 0,
): number {
  return splitByDestination(pending, plan).toTomorrow.reduce(
    (sum, t) => sum + (t.time_estimate_min ?? 0),
    tomorrowPlannedMin,
  );
}
