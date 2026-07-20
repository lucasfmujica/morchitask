import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/queries/cron", () => ({
  dueTaskReminders: vi.fn(async () => []),
  profileNotificationPrefs: vi.fn(async () => new Map()),
  subscriptionsForProfiles: vi.fn(async () => []),
  deleteSubscriptions: vi.fn(async () => {}),
  markRemindersSent: vi.fn(async () => {}),
}));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

const { GET } = await import("./route");

describe("GET /api/cron/task-reminders", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
  });

  it("rejects a request without the cron secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/task-reminders"));
    expect(res.status).toBe(401);
  });

  it("accepts the x-cron-secret header", async () => {
    const res = await GET(
      new Request("http://localhost/api/cron/task-reminders", {
        headers: { "x-cron-secret": "test-secret" },
      }),
    );
    expect(res.status).toBe(200);
  });
});
