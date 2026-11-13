import type { NotificationPrefs } from "@/lib/queries/types";

/**
 * The keys a person may set from Settings. `profiles.notification_prefs` also
 * carries markers only the server writes (AI usage, onboarding, checkout,
 * trial reminder); anything not listed here is dropped, so a crafted request
 * cannot reset a quota or erase a marker.
 */
export function pickNotificationPrefs(input: unknown): NotificationPrefs {
  if (!input || typeof input !== "object") return {};
  const src = input as Record<string, unknown>;
  const out: NotificationPrefs = {};
  if (typeof src.dailyPlan === "boolean") out.dailyPlan = src.dailyPlan;
  if (typeof src.taskReminders === "boolean") out.taskReminders = src.taskReminders;
  if (
    typeof src.dailyPlanTime === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(src.dailyPlanTime)
  ) {
    out.dailyPlanTime = src.dailyPlanTime;
  }
  return out;
}
