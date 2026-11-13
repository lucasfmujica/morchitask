/**
 * The morning cron, with the database and web-push mocked: who gets "plan your
 * day", and who gets the one-off "your trial ends soon".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import type { BillingFacts } from "@/lib/billing";
import es from "@/messages/es.json";

const sendNotification = vi.fn();
const claimTrialReminders = vi.fn();
let prefs: Map<string, { dailyPlan?: boolean }>;
let facts: Map<string, BillingFacts>;
let subs: { id: string; profile_id: string; endpoint: string; p256dh: string; auth_key: string }[];

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification },
}));
vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCron: () => true }));
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: "push" }) =>
    createTranslator({ locale: "es", messages: es, namespace }),
}));
vi.mock("@/lib/billing-config", () => ({ isBillingEnabled: () => true }));
vi.mock("@/lib/db/queries/cron", () => ({
  profileNotificationPrefs: async () => prefs,
  profileBillingFacts: async () => facts,
  profileLocales: async () => new Map(),
  subscriptionsForProfiles: async (ids: string[]) => subs.filter((s) => ids.includes(s.profile_id)),
  claimTrialReminders,
  deleteSubscriptions: vi.fn(),
}));

const { GET } = await import("./route");

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const sub = (profile: string) => ({
  id: `s-${profile}`,
  profile_id: profile,
  endpoint: `https://push.test/${profile}`,
  p256dh: "k",
  auth_key: "a",
});
const sentTo = () =>
  sendNotification.mock.calls.map(([target, payload]) => ({
    to: (target as { endpoint: string }).endpoint.split("/").pop(),
    title: JSON.parse(payload as string).title as string,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  sendNotification.mockResolvedValue({});
  claimTrialReminders.mockImplementation(async (ids: string[]) => ids);
});

describe("daily-plan cron", () => {
  it("skips a locked-out household but never a comped one", async () => {
    prefs = new Map([
      ["comped", { dailyPlan: true }],
      ["locked", { dailyPlan: true }],
    ]);
    facts = new Map([
      ["comped", { planOverride: "comp", trialEndsAt: null, subscription: null }],
      ["locked", { planOverride: null, trialEndsAt: inDays(-3), subscription: null }],
    ]);
    subs = [sub("comped"), sub("locked")];

    await GET(new Request("https://app.test/api/cron/daily-plan"));
    expect(sentTo().map((s) => s.to)).toEqual(["comped"]);
  });

  it("sends the trial reminder to whoever is in its last days and has a device", async () => {
    prefs = new Map();
    facts = new Map([
      ["ending", { planOverride: null, trialEndsAt: inDays(2.5), subscription: null }],
      ["early", { planOverride: null, trialEndsAt: inDays(10), subscription: null }],
      ["nodevice", { planOverride: null, trialEndsAt: inDays(2.5), subscription: null }],
    ]);
    subs = [sub("ending"), sub("early")];

    await GET(new Request("https://app.test/api/cron/daily-plan"));
    expect(claimTrialReminders).toHaveBeenCalledWith(["ending"]);
    expect(sentTo()).toEqual([{ to: "ending", title: "Tu prueba está por terminar" }]);
  });

  it("sends it once: someone already claimed gets nothing", async () => {
    prefs = new Map();
    facts = new Map([
      ["ending", { planOverride: null, trialEndsAt: inDays(2.5), subscription: null }],
    ]);
    subs = [sub("ending")];
    claimTrialReminders.mockResolvedValue([]);

    await GET(new Request("https://app.test/api/cron/daily-plan"));
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
