/** Task reminders skip a locked-out household, never a comped one. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import es from "@/messages/es.json";

const sendNotification = vi.fn();
const markRemindersSent = vi.fn();
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const sub = (profile: string) => ({
  id: `s-${profile}`,
  profile_id: profile,
  endpoint: `https://push.test/${profile}`,
  p256dh: "k",
  auth_key: "a",
});

vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));
vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCron: () => true }));
vi.mock("@/lib/billing-config", () => ({ isBillingEnabled: () => true }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: "push" }) =>
    createTranslator({ locale: "es", messages: es, namespace }),
}));
vi.mock("@/lib/db/queries/cron", () => ({
  dueTaskReminders: async () => [
    { id: "t1", owner_id: "comped", title: "Comprar pan", planned_date: null },
    { id: "t2", owner_id: "locked", title: "Pagar luz", planned_date: null },
  ],
  profileNotificationPrefs: async () =>
    new Map([
      ["comped", { taskReminders: true }],
      ["locked", { taskReminders: true }],
    ]),
  profileBillingFacts: async () =>
    new Map([
      ["comped", { planOverride: "comp", trialEndsAt: null, subscription: null }],
      ["locked", { planOverride: null, trialEndsAt: inDays(-2), subscription: null }],
    ]),
  profileLocales: async () => new Map(),
  subscriptionsForProfiles: async () => [sub("comped"), sub("locked")],
  markRemindersSent,
  deleteSubscriptions: vi.fn(),
}));

const { GET } = await import("./route");

beforeEach(() => vi.clearAllMocks());

describe("task-reminders cron", () => {
  it("reminds the comped household and not the locked-out one", async () => {
    await GET(new Request("https://app.test/api/cron/task-reminders"));
    const to = sendNotification.mock.calls.map(([t]) => (t as { endpoint: string }).endpoint);
    expect(to).toEqual(["https://push.test/comped"]);
    // Both are marked sent, so the locked-out reminders do not all fire at once
    // the day the household pays.
    expect(markRemindersSent).toHaveBeenCalledWith(["t1", "t2"], expect.any(String));
  });
});
