"use server";

import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import { createTask } from "@/lib/actions/tasks";
import { myChannels } from "@/lib/db/queries/channels";
import { markOnboarded } from "@/lib/db/queries/onboarding";
import { updateProfile } from "@/lib/db/queries/profiles";
import { todayISO } from "@/lib/date";
import { capacityFromHours, channelForKind, sanitizeOnboardingTasks } from "@/lib/onboarding";
import { orderForAppend } from "@/lib/ordering";

/** Step 1: the daily capacity, saved as the profile's default (the same value
 *  every day falls back to when it has none of its own). */
export async function saveOnboardingCapacity(hours: number) {
  const { userId } = await requireWriteAccess();
  await updateProfile(userId, { capacity_target_min: capacityFromHours(hours) });
}

/** "Saltar": out of the flow for good, nothing created. */
export async function skipOnboarding() {
  const { householdId, userId } = await requireSession();
  await markOnboarded(householdId, userId);
}

/**
 * Step 3: the tasks they kept, on today, then the marker.
 *
 * Through `createTask`, the same action the composer uses, so these are
 * ordinary tasks from the first second. Categories are looked up here from the
 * person's own, by name: the browser says "work" or "personal", never an id.
 *
 * The marker goes last on purpose. If a task fails, they stay in onboarding and
 * can try again; and the tasks that did land already count as "has tasks", so
 * nobody gets sent through it twice either way.
 */
export async function finishOnboarding(input: unknown) {
  const { householdId, userId } = await requireWriteAccess();
  const kept = sanitizeOnboardingTasks(input);
  const channels = await myChannels(householdId, userId);
  const date = todayISO();

  const orders: number[] = [];
  for (const task of kept) {
    const sortOrder = orderForAppend(orders);
    orders.push(sortOrder);
    // One at a time, in the order shown, so they land in that order.
    await createTask({
      title: task.title,
      plannedDate: date,
      channelId: channelForKind(channels, task.kind)?.id ?? null,
      timeEstimateMin: task.minutes,
      sortOrder,
    });
  }

  await markOnboarded(householdId, userId);
}
