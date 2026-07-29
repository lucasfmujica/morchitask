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
 * How the day went against the estimate, as something you'd actually say.
 * Within 10% counts as on target — false precision here would just be noise.
 */
export function accuracyLabel(accuracy: number | null): string | null {
  if (accuracy === null) return null;
  if (accuracy >= 0.9 && accuracy <= 1.1) return "Calculaste bien el día";
  const pct = Math.round(Math.abs(accuracy - 1) * 100);
  return accuracy > 1 ? `Tardaste ${pct}% más de lo previsto` : `Terminaste ${pct}% antes`;
}

/** The five moods, stored as 1..5 in `daily_notes.mood` — no migration needed.
 *  Words rather than bare numbers: "3 de 5" tells you nothing a month later. */
export const MOODS = [
  { value: 1, label: "Duro", emoji: "😩" },
  { value: 2, label: "Flojo", emoji: "😕" },
  { value: 3, label: "Normal", emoji: "😐" },
  { value: 4, label: "Bueno", emoji: "🙂" },
  { value: 5, label: "Excelente", emoji: "😄" },
] as const;
