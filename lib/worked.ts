/**
 * Worked time: how much of the day someone actually tracked, drawn against a
 * fixed daily goal.
 *
 * The day strips (Hoy, Semana, Mes) used to draw PLANNED time against the
 * capacity budget. That only says something to whoever plans; for someone who
 * mostly just works, a bar fed by estimates sat empty or full regardless of how
 * the day went. These strips now answer "how much did I work", which every day
 * has an answer to, and planning moved to the text beside them.
 *
 * Pure on purpose: the views, the tests and a future per-person setting all go
 * through `resolveWorkGoal`, so making the goal configurable is one argument,
 * not a hunt for the literal.
 */

/** The daily work goal: 5h. Constant for now, see `resolveWorkGoal`. */
export const WORK_GOAL_MIN = 300;

/**
 * The goal to draw against. Takes a person's own value so a per-user setting
 * can be threaded in later without touching the callers' arithmetic; until one
 * exists every caller passes nothing and gets the 5h.
 */
export function resolveWorkGoal(personalGoalMin?: number | null): number {
  return personalGoalMin && personalGoalMin > 0 ? personalGoalMin : WORK_GOAL_MIN;
}

export type WorkedState = {
  /** Fill width as a 0–100 percentage, capped: past the goal the bar is just full. */
  pct: number;
  /** At or past the goal. Calm, not a warning: working more isn't a failure. */
  reached: boolean;
  /** Minutes still missing to the goal (0 once reached). */
  leftMin: number;
};

export function workedState(workedMin: number, goalMin: number = WORK_GOAL_MIN): WorkedState {
  const worked = Number.isFinite(workedMin) ? Math.max(0, workedMin) : 0;
  if (goalMin <= 0) return { pct: 0, reached: false, leftMin: 0 };
  // Whole minutes, as the labels print them: 299.6 tracked shows as "5h", so it
  // must also read as reached rather than "te falta 0m".
  const rounded = Math.round(worked);
  const reached = rounded >= goalMin;
  return {
    pct: Math.min(100, Math.round((worked / goalMin) * 100)),
    reached,
    leftMin: reached ? 0 : goalMin - rounded,
  };
}

/**
 * Whether a day can have worked time yet. Future days can't by definition, so
 * the strips show them empty and fall back to the plan in words. Compared as
 * ISO dates, never as labels.
 */
export function canHaveWorked(day: string, today: string): boolean {
  return day <= today;
}

/** `{day, minutes}` rows from the API → minutes per day, summing duplicates. */
export function workedByDay(
  rows: readonly { day: string; minutes: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const m = Number(r.minutes);
    if (!Number.isFinite(m) || m <= 0) continue;
    out.set(r.day, (out.get(r.day) ?? 0) + m);
  }
  return out;
}
