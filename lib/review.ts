import { parseISO } from "date-fns";
import { addDays, weekRange, type DayISO } from "@/lib/date";
import { completion, estimatedVsActual } from "@/lib/analytics";
import type { AnalyticsTask } from "@/lib/queries/tasks";

/**
 * Pure helpers for the weekly review ritual (/review). Weeks start on Monday,
 * like everywhere else in the app (`weekRange(day, 1)`).
 */

function isoWeekday(day: DayISO): number {
  const dow = parseISO(day).getDay();
  return dow === 0 ? 7 : dow;
}

/** Monday of the week containing `day`. */
export function weekStartOf(day: DayISO): DayISO {
  return weekRange(day, 1)[0];
}

/**
 * The week a review started on `today` is about. From Friday to Sunday it's the
 * week you're finishing; Monday to Thursday it's the one that just ended — the
 * review you skipped on the weekend is still the useful one on Monday.
 */
export function reviewWeekFor(today: DayISO): DayISO {
  const monday = weekStartOf(today);
  return isoWeekday(today) >= 5 ? monday : addDays(monday, -7);
}

/** When the sidebar should nudge you toward the review: Friday afternoon
 *  through Monday morning. */
export function isReviewWindow(today: DayISO, hour: number, morningUntil = 14): boolean {
  const dow = isoWeekday(today);
  if (dow === 5) return hour >= morningUntil;
  if (dow === 1) return hour < morningUntil;
  return dow === 6 || dow === 7;
}

type ReviewTask = AnalyticsTask & { id: string; template_id: string | null };

/** The person's unfinished, non-routine tasks — what step 2 asks you to place.
 *  Routines are left out for the same reason as in the daily shutdown: their
 *  next copy generates itself. */
export function weekLeftovers<T extends ReviewTask>(tasks: readonly T[], meId: string): T[] {
  return tasks.filter((t) => t.owner_id === meId && t.status !== "done" && !t.template_id);
}

export type WeekSummary = {
  done: number;
  total: number;
  estimatedMin: number;
  actualMin: number;
  /** Day with the most completed tasks, if any were completed. */
  bestDay: DayISO | null;
};

export function weekSummary(tasks: readonly AnalyticsTask[], meId: string): WeekSummary {
  const mine = tasks.filter((t) => t.owner_id === meId);
  const { done, total } = completion(mine);
  const { estimatedMin, actualMin } = estimatedVsActual(mine);

  const perDay = new Map<DayISO, number>();
  for (const t of mine) {
    if (t.status === "done" && t.planned_date) {
      perDay.set(t.planned_date, (perDay.get(t.planned_date) ?? 0) + 1);
    }
  }
  let bestDay: DayISO | null = null;
  for (const [day, n] of perDay) {
    if (
      bestDay === null ||
      n > perDay.get(bestDay)! ||
      (n === perDay.get(bestDay) && day < bestDay)
    ) {
      bestDay = day;
    }
  }

  return { done, total, estimatedMin, actualMin, bestDay };
}

/** Where each task goes in the review: a day of next week, or nowhere yet. */
export type WeekAssignments = Record<string, DayISO | undefined>;

/**
 * Planned minutes per day of next week once the assignments are applied — so
 * the review can show the load of each day while you spread work across it.
 */
export function projectedDayLoads(
  days: readonly DayISO[],
  existingMin: ReadonlyMap<DayISO, number>,
  tasks: readonly { id: string; time_estimate_min: number | null }[],
  assignments: WeekAssignments,
): Map<DayISO, number> {
  const loads = new Map(days.map((d) => [d, existingMin.get(d) ?? 0]));
  for (const t of tasks) {
    const day = assignments[t.id];
    if (day && loads.has(day)) loads.set(day, loads.get(day)! + (t.time_estimate_min ?? 0));
  }
  return loads;
}
