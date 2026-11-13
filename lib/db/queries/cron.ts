import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { households, profiles, pushSubscriptions, subscriptions, tasks } from "@/lib/db/schema";
import { isSubscriptionStatus, type BillingFacts } from "@/lib/billing";
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

function toISO(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Every profile's billing facts, for deciding who a cron may still notify.
 *
 * Unscoped like the rest of this file: the crons sweep every household. One
 * query for all of them, the same join `billingFacts` does for one household
 * on the way into a request, so the crons and the app agree on who is in.
 */
export async function profileBillingFacts(): Promise<Map<string, BillingFacts>> {
  const rows = await db
    .select({
      id: profiles.id,
      trialEndsAt: households.trial_ends_at,
      planOverride: households.plan_override,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.current_period_end,
    })
    .from(profiles)
    .innerJoin(households, eq(households.id, profiles.household_id))
    .leftJoin(subscriptions, eq(subscriptions.household_id, profiles.household_id));

  return new Map(
    rows.map((r) => [
      r.id,
      {
        planOverride: r.planOverride,
        trialEndsAt: toISO(r.trialEndsAt),
        subscription: isSubscriptionStatus(r.status)
          ? { status: r.status, currentPeriodEnd: toISO(r.currentPeriodEnd) }
          : null,
      },
    ]),
  );
}

/**
 * Claims the "your trial is about to end" push for these people, once each.
 *
 * The marker goes in `notification_prefs` like `checkout_started_at`, because
 * a column would need a migration. Set in the same statement that checks it
 * is absent, so a cron that runs twice (a retry, a manual run) claims nobody
 * the second time; only the ids it returns get the push.
 */
export async function claimTrialReminders(profileIds: string[]): Promise<string[]> {
  if (profileIds.length === 0) return [];
  const rows = await db
    .update(profiles)
    .set({
      notification_prefs: sql`${profiles.notification_prefs} || jsonb_build_object('trial_reminder_sent_at', now())`,
    })
    .where(
      and(
        inArray(profiles.id, profileIds),
        sql`${profiles.notification_prefs} ->> 'trial_reminder_sent_at' is null`,
      ),
    )
    .returning({ id: profiles.id });
  return rows.map((r) => r.id);
}
