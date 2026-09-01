"use server";

import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/carryover";
import type { CarriedTask } from "@/lib/db/queries/carryover";

export type { CarriedTask };

/**
 * Brings forward everything an earlier day left unfinished.
 *
 * Called by the Today view on open rather than by a cron, because the sweep has
 * to happen in the person's own calendar day and the household timezone is the
 * only thing that defines it — a job at 03:00 UTC is the middle of the previous
 * afternoon in Buenos Aires. Today is already asking the browser what day it
 * is, so the answer is on hand exactly when it is needed.
 *
 * `today` comes from the client, which means it cannot be trusted to be today:
 * everything it can do is move the caller's own unfinished tasks onto the date
 * it names, inside the caller's own household. That is a thing the person can
 * already do by hand, so a wrong value is a wrong day, not a way into someone
 * else's data.
 */
export async function sweepOverdueToToday(today: string): Promise<CarriedTask[]> {
  const { householdId, userId } = await requireWriteAccess();

  // Claim first, sweep second. The other order would let two tabs both sweep
  // and only one record it, and the loser's rows would be counted twice.
  if (!(await data.claimCarryover(householdId, userId, today))) return [];

  return data.sweepOverdue(householdId, userId, today);
}

/** Sends a sweep back where it came from. Deliberately leaves the day marked as
 *  swept: undo means "not today", not "ask me again on the next page load". */
export async function undoCarryover(today: string, moves: CarriedTask[]) {
  const { householdId, userId } = await requireWriteAccess();
  return data.restoreCarried(householdId, userId, today, moves);
}

/** What is waiting on earlier days, without moving any of it. For the manual
 *  button on an empty day, which should say how much it is about to bring. */
export async function countOverdue(today: string) {
  const { householdId, userId } = await requireSession();
  return data.overdueCount(householdId, userId, today);
}

/** The manual version of the sweep, for the button. Skips the once-a-day claim
 *  on purpose — this one was asked for. */
export async function carryOverdueNow(today: string): Promise<CarriedTask[]> {
  const { householdId, userId } = await requireWriteAccess();
  return data.sweepOverdue(householdId, userId, today);
}
