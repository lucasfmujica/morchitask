import { describe, expect, it } from "vitest";
import {
  bandEndLabel,
  bandPercent,
  capacityFromHours,
  channelForKind,
  EXAMPLE_TASKS,
  firstDayFit,
  initialHours,
  isOnboarded,
  MAX_ONBOARDING_TASKS,
  nextEstimate,
  onboardingStepPath,
  parseOnboardingStep,
  sanitizeOnboardingTasks,
} from "./onboarding";

const fresh = { onboardedAt: null, planOverride: null, householdHasTasks: false };

describe("isOnboarded", () => {
  it("sends a brand-new account through onboarding", () => {
    expect(isOnboarded(fresh)).toBe(false);
  });

  it("lets through anyone with the marker", () => {
    expect(isOnboarded({ ...fresh, onboardedAt: "2026-11-13T12:00:00Z" })).toBe(true);
  });

  // The two people who use this every day have no marker: they predate it.
  // Each of these is one of the ways they are recognised without one.
  it("never onboards a comped household, even with no marker and no tasks", () => {
    expect(isOnboarded({ ...fresh, planOverride: "comp" })).toBe(true);
  });

  it("never onboards a household that already has tasks", () => {
    expect(isOnboarded({ ...fresh, householdHasTasks: true })).toBe(true);
  });

  it("treats any other override as no override", () => {
    expect(isOnboarded({ ...fresh, planOverride: "something-else" })).toBe(false);
  });
});

describe("steps", () => {
  it("parses only the three steps, written exactly", () => {
    expect(parseOnboardingStep("1")).toBe(1);
    expect(parseOnboardingStep("3")).toBe(3);
    for (const bad of ["0", "4", "01", "1.0", "", "x", " 2"]) {
      expect(parseOnboardingStep(bad)).toBeNull();
    }
  });

  it("builds the step URL Google returns to", () => {
    expect(onboardingStepPath(3)).toBe("/onboarding/3");
  });
});

describe("capacity step", () => {
  it("starts at 6h, the app's default, unless a choice was already saved", () => {
    expect(initialHours(null)).toBe(6);
    expect(initialHours(undefined)).toBe(6);
    expect(initialHours(240)).toBe(4);
    // Saved values that are not one of the six buttons fall back to the default.
    expect(initialHours(270)).toBe(6);
    expect(initialHours(600)).toBe(6);
  });

  it("saves hours as clamped minutes", () => {
    expect(capacityFromHours(6)).toBe(360);
    expect(capacityFromHours(3)).toBe(180);
    expect(capacityFromHours(100)).toBe(960);
    expect(() => capacityFromHours(Number.NaN)).toThrow();
  });

  it("draws the band from 09:00 over nine hours", () => {
    expect(bandPercent(6)).toBe(67);
    expect(bandPercent(8)).toBe(89);
    expect(bandEndLabel(6)).toBe("15:00");
    expect(bandEndLabel(3)).toBe("12:00");
  });
});

describe("first day step", () => {
  it("walks the estimate chip through the composer's steps and wraps", () => {
    expect(nextEstimate(20)).toBe(30);
    expect(nextEstimate(90)).toBe(120);
    expect(nextEstimate(120)).toBe(10);
    expect(nextEstimate(37)).toBe(10);
  });

  it("starts with three examples that fit a 6h day", () => {
    expect(EXAMPLE_TASKS).toHaveLength(3);
    const total = EXAMPLE_TASKS.reduce((a, t) => a + t.minutes, 0);
    expect(firstDayFit(total, 360)).toBe("fits");
  });

  it("says which sentence the capacity tile shows", () => {
    expect(firstDayFit(0, 360)).toBe("empty");
    expect(firstDayFit(120, 360)).toBe("fits");
    expect(firstDayFit(360, 360)).toBe("exact");
    expect(firstDayFit(361, 360)).toBe("over");
  });

  it("cleans what the browser sends before anything is written", () => {
    const out = sanitizeOnboardingTasks([
      { title: "  Revisar el mail ", minutes: 20, kind: "work" },
      { title: "   ", minutes: 30, kind: "work" },
      { title: "Odd estimate", minutes: 7, kind: "personal" },
      { title: "Bad kind", minutes: 15, kind: "admin" },
      { title: 42 },
      null,
      "nope",
    ]);
    expect(out).toEqual([
      { title: "Revisar el mail", minutes: 20, kind: "work" },
      { title: "Odd estimate", minutes: 30, kind: "personal" },
      { title: "Bad kind", minutes: 15, kind: "work" },
    ]);
    expect(sanitizeOnboardingTasks("not a list")).toEqual([]);
  });

  it("caps the list and each title", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, minutes: 10 }));
    expect(sanitizeOnboardingTasks(many)).toHaveLength(MAX_ONBOARDING_TASKS);
    const [long] = sanitizeOnboardingTasks([{ title: "x".repeat(500), minutes: 10 }]);
    expect(long.title).toHaveLength(200);
  });

  it("files examples by category name and never guesses", () => {
    const seeded = [
      { id: "w", name: "Trabajo" },
      { id: "h", name: "Hogar" },
      { id: "p", name: "Personal" },
    ];
    expect(channelForKind(seeded, "work")?.id).toBe("w");
    expect(channelForKind(seeded, "personal")?.id).toBe("p");
    expect(channelForKind([{ id: "w", name: " work " }], "work")?.id).toBe("w");
    expect(channelForKind([{ id: "x", name: "Clientes" }], "work")).toBeNull();
  });
});
