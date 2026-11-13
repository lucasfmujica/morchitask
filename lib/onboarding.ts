import { clampCapacity } from "@/lib/capacity";

/**
 * First use: the three screens a brand-new account sees before Hoy.
 *
 * Pure on purpose. The one rule here that can hurt someone is who gets sent to
 * onboarding, and the two people who already use this app every day must never
 * be among them: they were here before the marker existed, so "no marker" alone
 * would bounce them out of their own day on the next deploy. Everything that
 * decides that is a function of its inputs, so each way of being an existing
 * user is a test rather than a morning someone loses.
 */

/** Where the flow lives. Step 3 is also where Google sends people back to
 *  after connecting the calendar on step 2. */
export const ONBOARDING_PATH = "/onboarding";
export const ONBOARDING_STEPS = [1, 2, 3] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function onboardingStepPath(step: OnboardingStep): string {
  return `${ONBOARDING_PATH}/${step}`;
}

/** The URL segment as a step, or null for anything else (a 404, not a guess). */
export function parseOnboardingStep(segment: string): OnboardingStep | null {
  const n = Number(segment);
  return (ONBOARDING_STEPS as readonly number[]).includes(n) && String(n) === segment
    ? (n as OnboardingStep)
    : null;
}

/**
 * The key in `profiles.notification_prefs` that says this person is past
 * onboarding. Stored there, like `checkout_started_at`, because that is the one
 * jsonb column on a row we already write and a column of its own would have
 * needed a migration for a single timestamp.
 */
export const ONBOARDED_MARKER = "onboarded_at";

export type OnboardingFacts = {
  /** The marker's value, when set (an ISO-ish timestamp). */
  onboardedAt: string | null;
  /** `households.plan_override`. "comp" is a household set up by hand. */
  planOverride: string | null;
  /** Whether the household already has any task, done or not, dated or not. */
  householdHasTasks: boolean;
};

/**
 * Whether someone is past onboarding.
 *
 * The marker is only half of it. The other two are how an account that existed
 * before onboarding did is recognised without writing anything to it:
 *
 * - a comped household was set up by hand, by people who know the app;
 * - a household with any task in it is already being used. That also covers
 *   someone who joins an existing space on an invite: they arrive at a list
 *   that already has things in it, and three example tasks on top of the
 *   other person's day would be clutter, not a welcome.
 *
 * Any one of the three is enough. Getting this wrong in the generous direction
 * costs a new person a tour; in the other direction it costs an existing person
 * their morning.
 */
export function isOnboarded(facts: OnboardingFacts): boolean {
  return !!facts.onboardedAt || facts.planOverride === "comp" || facts.householdHasTasks;
}

/** Step 1's choices, in whole hours. */
export const ONBOARDING_HOURS = [3, 4, 5, 6, 7, 8] as const;
export type OnboardingHours = (typeof ONBOARDING_HOURS)[number];

/** The app's default capacity is 6h (`DEFAULT_CAPACITY_MIN`); so is the design's. */
export const DEFAULT_ONBOARDING_HOURS: OnboardingHours = 6;

/**
 * Where step 1 starts: the saved capacity when it is one of the choices (someone
 * who went back from step 2), otherwise the default.
 */
export function initialHours(capacityTargetMin: number | null | undefined): OnboardingHours {
  if (capacityTargetMin == null || capacityTargetMin % 60 !== 0) return DEFAULT_ONBOARDING_HOURS;
  const h = capacityTargetMin / 60;
  return (ONBOARDING_HOURS as readonly number[]).includes(h)
    ? (h as OnboardingHours)
    : DEFAULT_ONBOARDING_HOURS;
}

/** Hours as the profile's capacity, clamped like every other capacity write. */
export function capacityFromHours(hours: number): number {
  if (!Number.isFinite(hours)) throw new Error("invalid hours");
  return clampCapacity(hours * 60);
}

/**
 * The bar on step 1 is a nine-hour band from 09:00, so eight hours never reads
 * as "full to the brim"; the end label rides the fill.
 */
export const BAND_START_HOUR = 9;
export const BAND_HOURS = 9;

export function bandPercent(hours: number): number {
  return Math.round((hours / BAND_HOURS) * 100);
}

/** "15:00" for six hours: when the day would end if it started at 09:00. */
export function bandEndLabel(hours: number): string {
  return `${String(BAND_START_HOUR + hours).padStart(2, "0")}:00`;
}

/** The estimates the duration chip walks through, the composer's own steps. */
export const ESTIMATE_STEPS = [10, 15, 20, 30, 45, 60, 90, 120] as const;

/** The next estimate, wrapping round; anything off the list starts again. */
export function nextEstimate(min: number): number {
  const i = (ESTIMATE_STEPS as readonly number[]).indexOf(min);
  return ESTIMATE_STEPS[(i + 1) % ESTIMATE_STEPS.length];
}

/** What a task you type in yourself starts at. */
export const NEW_TASK_ESTIMATE = 30;

/** The list stops taking more at five: it is a first day, not a backlog. */
export const MAX_ONBOARDING_TASKS = 5;

/** Same ceiling an emailed-in task's subject gets (`lib/inbound.ts`): this
 *  arrives from outside the app's own composer, so it gets one too. */
export const MAX_TITLE_LENGTH = 200;

/** Which of the person's own categories an example task lands in. */
export type ExampleKind = "work" | "personal";

/**
 * The three tasks step 3 starts with. Titles are catalog keys: they are
 * written in the reader's language, and only become data when kept.
 */
export const EXAMPLE_TASKS = [
  { key: "exampleMail", minutes: 20, kind: "work" },
  { key: "exampleDeepWork", minutes: 90, kind: "work" },
  { key: "exampleCloseDay", minutes: 10, kind: "personal" },
] as const satisfies readonly { key: string; minutes: number; kind: ExampleKind }[];

export type OnboardingTask = { title: string; minutes: number; kind: ExampleKind };

/**
 * What step 3 sends, made safe to write: titles trimmed and capped, empty ones
 * dropped, estimates kept to the chip's steps, at most five. It arrives from the
 * browser, so nothing in it is trusted.
 */
export function sanitizeOnboardingTasks(input: unknown): OnboardingTask[] {
  if (!Array.isArray(input)) return [];
  const out: OnboardingTask[] = [];
  for (const raw of input) {
    if (out.length >= MAX_ONBOARDING_TASKS) break;
    if (!raw || typeof raw !== "object") continue;
    const { title, minutes, kind } = raw as Record<string, unknown>;
    if (typeof title !== "string") continue;
    const clean = title.trim().slice(0, MAX_TITLE_LENGTH);
    if (!clean) continue;
    out.push({
      title: clean,
      minutes:
        typeof minutes === "number" && (ESTIMATE_STEPS as readonly number[]).includes(minutes)
          ? minutes
          : NEW_TASK_ESTIMATE,
      kind: kind === "personal" ? "personal" : "work",
    });
  }
  return out;
}

/**
 * The category an example lands in, by name. Categories are rows the person
 * owns and can rename, so a missing match means no category rather than a
 * guess by position: a task filed under the wrong one is worse than none.
 */
const KIND_NAMES: Record<ExampleKind, readonly string[]> = {
  work: ["trabajo", "work"],
  personal: ["personal"],
};

export function channelForKind<T extends { id: string; name: string }>(
  channels: readonly T[],
  kind: ExampleKind,
): T | null {
  const names = KIND_NAMES[kind];
  return channels.find((c) => names.includes(c.name.trim().toLowerCase())) ?? null;
}

/** Which sentence step 3's capacity tile says. */
export type FirstDayFit = "empty" | "fits" | "exact" | "over";

export function firstDayFit(plannedMin: number, capacityMin: number): FirstDayFit {
  if (plannedMin > capacityMin) return "over";
  if (plannedMin === 0) return "empty";
  if (plannedMin === capacityMin) return "exact";
  return "fits";
}
