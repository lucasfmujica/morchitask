import { describe, expect, it } from "vitest";
import { pickNotificationPrefs } from "./notification-prefs";

describe("pickNotificationPrefs", () => {
  it("keeps the keys a person can set", () => {
    expect(
      pickNotificationPrefs({ dailyPlan: true, taskReminders: false, dailyPlanTime: "08:30" }),
    ).toEqual({
      dailyPlan: true,
      taskReminders: false,
      dailyPlanTime: "08:30",
    });
  });

  it("drops server-owned markers so the browser cannot reset or erase them", () => {
    expect(
      pickNotificationPrefs({
        dailyPlan: true,
        ai_usage: { day: "2026-11-13", count: 0 },
        onboarded_at: null,
        checkout_started_at: null,
        trial_reminder_sent_at: null,
      }),
    ).toEqual({ dailyPlan: true });
  });

  it("drops wrongly typed values", () => {
    expect(pickNotificationPrefs({ dailyPlan: "yes", dailyPlanTime: "25:00" })).toEqual({});
    expect(pickNotificationPrefs(null)).toEqual({});
  });
});
