import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles, pushSubscriptions, tasks } from "@/lib/db/schema";
import type { NotificationPrefs } from "@/lib/queries/types";
import { toLocale } from "@/lib/locale";

/**
 * System-wide reads/writes for the cron jobs (daily plan push, task reminders).
 * Unlike the rest of lib/db/queries/*, these are intentionally NOT scoped to a
 * single household — the cron endpoints run with no user session, gated only
 * by CRON_SECRET, and need to sweep every household at once.
 */

export async function profileNotificationPrefs() {
  const rows = await db
    .select({ id: profiles.id, prefs: profiles.notification_prefs })
    .from(profiles);
  return new Map(rows.map((r) => [r.id, r.prefs as NotificationPrefs]));
}

/**
 * Everyone's chosen language, for the crons.
 *
 * A push is the one place the server picks words for someone else with no
 * request of theirs to read a cookie from, so the column is the only source
 * there is. Returned as a map so a sweep over every household costs one query,
 * not one per recipient.
 */
export async function profileLocales() {
  const rows = await db.select({ id: profiles.id, locale: profiles.locale }).from(profiles);
  return new Map(rows.map((r) => [r.id, toLocale(r.locale)]));
}

export async function subscriptionsForProfiles(profileIds: string[]) {
  if (profileIds.length === 0) return [];
  return db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.profile_id, profileIds));
}

export async function deleteSubscriptions(ids: string[]) {
  if (ids.length === 0) return;
  await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, ids));
}

export async function dueTaskReminders(nowISO: string) {
  return db
    .select({
      id: tasks.id,
      owner_id: tasks.owner_id,
      title: tasks.title,
      planned_date: tasks.planned_date,
    })
    .from(tasks)
    .where(
      and(lte(tasks.remind_at, nowISO), isNull(tasks.reminder_sent_at), eq(tasks.status, "todo")),
    );
}

export async function markRemindersSent(taskIds: string[], nowISO: string) {
  if (taskIds.length === 0) return;
  await db.update(tasks).set({ reminder_sent_at: nowISO }).where(inArray(tasks.id, taskIds));
}
