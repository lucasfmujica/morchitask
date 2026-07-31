import { describe, it, expect } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { applyDayEdit, buildTimeBreakdown, splitRunByDay, totalMinutes } from "./time-entries";
import { DEFAULT_TIMEZONE } from "./date";

/** Epoch ms for a local wall-clock time in the household timezone. */
function at(day: string, time: string) {
  return fromZonedTime(`${day}T${time}:00`, DEFAULT_TIMEZONE).getTime();
}

describe("splitRunByDay", () => {
  it("keeps a same-day run in one segment", () => {
    const segments = splitRunByDay(at("2026-07-29", "09:00"), at("2026-07-29", "11:30"));
    expect(segments).toEqual([{ day: "2026-07-29", minutes: 150 }]);
  });

  it("cuts a run at local midnight, charging each day what it earned", () => {
    const segments = splitRunByDay(at("2026-07-29", "23:00"), at("2026-07-30", "01:30"));
    expect(segments).toEqual([
      { day: "2026-07-29", minutes: 60 },
      { day: "2026-07-30", minutes: 90 },
    ]);
  });

  it("emits one segment per day for a run spanning a full day", () => {
    const segments = splitRunByDay(at("2026-07-28", "22:00"), at("2026-07-30", "02:00"));
    expect(segments.map((s) => s.day)).toEqual(["2026-07-28", "2026-07-29", "2026-07-30"]);
    expect(totalMinutes(segments)).toBe(28 * 60);
  });

  it("logs nothing for a zero-length or backwards run", () => {
    const t = at("2026-07-29", "09:00");
    expect(splitRunByDay(t, t)).toEqual([]);
    expect(splitRunByDay(t, t - 1000)).toEqual([]);
  });

  it("respects a non-default timezone", () => {
    // 23:00 in Buenos Aires is already 04:00 (next day) in Madrid.
    const start = at("2026-07-29", "23:00");
    const end = at("2026-07-29", "23:30");
    expect(splitRunByDay(start, end, "Europe/Madrid")).toEqual([
      { day: "2026-07-30", minutes: 30 },
    ]);
  });
});

describe("buildTimeBreakdown", () => {
  const entry = (day: string, minutes: number, user_id = "lucas") => ({ day, minutes, user_id });

  it("sorts days newest first and totals each one", () => {
    const b = buildTimeBreakdown(
      [entry("2026-07-28", 45), entry("2026-07-30", 20), entry("2026-07-29", 120)],
      185,
    );
    expect(b.days.map((d) => [d.day, d.minutes])).toEqual([
      ["2026-07-30", 20],
      ["2026-07-29", 120],
      ["2026-07-28", 45],
    ]);
    expect(b.trackedMin).toBe(185);
    expect(b.maxDayMin).toBe(120);
    expect(b.untrackedMin).toBe(0);
  });

  it("merges both people's time on a shared day, biggest contributor first", () => {
    const b = buildTimeBreakdown(
      [entry("2026-07-29", 30, "lucas"), entry("2026-07-29", 50, "sofi")],
      80,
    );
    expect(b.days).toHaveLength(1);
    expect(b.days[0].minutes).toBe(80);
    expect(b.days[0].byUser).toEqual([
      { userId: "sofi", minutes: 50 },
      { userId: "lucas", minutes: 30 },
    ]);
  });

  it("reports time the per-day rows can't explain (manual edits, old tasks)", () => {
    const b = buildTimeBreakdown([entry("2026-07-29", 30)], 90);
    expect(b.untrackedMin).toBe(60);
  });

  it("never reports negative unaccounted time when the rows overshoot", () => {
    expect(buildTimeBreakdown([entry("2026-07-29", 30)], 10).untrackedMin).toBe(0);
  });

  it("folds the running stopwatch into its day without inflating the remainder", () => {
    const b = buildTimeBreakdown([entry("2026-07-29", 30)], 30, [
      { day: "2026-07-29", minutes: 15, userId: "lucas" },
    ]);
    expect(b.days[0].minutes).toBe(45);
    expect(b.untrackedMin).toBe(0);
  });

  it("opens a new day row for a stopwatch started after midnight", () => {
    const b = buildTimeBreakdown([entry("2026-07-29", 30)], 30, [
      { day: "2026-07-30", minutes: 10, userId: "lucas" },
    ]);
    expect(b.days.map((d) => d.day)).toEqual(["2026-07-30", "2026-07-29"]);
  });

  it("splits a live run that already crossed midnight into two rows", () => {
    const b = buildTimeBreakdown([], 0, [
      { day: "2026-07-29", minutes: 40, userId: "lucas" },
      { day: "2026-07-30", minutes: 20, userId: "lucas" },
    ]);
    expect(b.days.map((d) => [d.day, d.minutes])).toEqual([
      ["2026-07-30", 20],
      ["2026-07-29", 40],
    ]);
    expect(b.untrackedMin).toBe(0);
  });

  it("returns an empty breakdown for a task with no tracked time", () => {
    const b = buildTimeBreakdown([], 0);
    expect(b).toEqual({ days: [], trackedMin: 0, untrackedMin: 0, maxDayMin: 0 });
  });
});

describe("applyDayEdit", () => {
  const lucas = "lucas";
  const sofi = "sofi";

  it("reassigns unaccounted time to a day without inflating the total", () => {
    // "Real" was edited by hand to 2h, so all 120m sit in "Sin fecha".
    const r = applyDayEdit([], 120, lucas, "2026-07-29", 120);
    expect(r).toEqual({ entryMinutes: 120, nextTotal: 120 });
  });

  it("only grows the total by what 'Sin fecha' can't cover", () => {
    // 30m unaccounted, claiming 50m for a day → 20m of genuinely new time.
    const r = applyDayEdit(
      [{ day: "2026-07-30", minutes: 60, user_id: lucas }],
      90,
      lucas,
      "2026-07-29",
      50,
    );
    expect(r.nextTotal).toBe(110);
  });

  it("grows the total one-for-one when nothing is unaccounted", () => {
    const entries = [{ day: "2026-07-30", minutes: 60, user_id: lucas }];
    expect(applyDayEdit(entries, 60, lucas, "2026-07-29", 25).nextTotal).toBe(85);
  });

  it("takes a reduction straight off the total", () => {
    const entries = [{ day: "2026-07-30", minutes: 60, user_id: lucas }];
    expect(applyDayEdit(entries, 60, lucas, "2026-07-30", 20)).toEqual({
      entryMinutes: 20,
      nextTotal: 20,
    });
  });

  it("edits only my own share of a day the two of us worked", () => {
    const entries = [
      { day: "2026-07-30", minutes: 60, user_id: sofi },
      { day: "2026-07-30", minutes: 30, user_id: lucas },
    ];
    // Lucas corrects his 30m to 45m: +15m, and Sofi's 60m is untouched.
    expect(applyDayEdit(entries, 90, lucas, "2026-07-30", 45).nextTotal).toBe(105);
  });

  it("clears a day to zero and never drives the total negative", () => {
    const entries = [{ day: "2026-07-30", minutes: 60, user_id: lucas }];
    expect(applyDayEdit(entries, 10, lucas, "2026-07-30", 0)).toEqual({
      entryMinutes: 0,
      nextTotal: 0,
    });
  });

  it("rejects negative input instead of storing it", () => {
    expect(applyDayEdit([], 30, lucas, "2026-07-30", -15).entryMinutes).toBe(0);
  });

  it("rounds to whole seconds so hand-edits don't carry float dust", () => {
    const r = applyDayEdit([], 0, lucas, "2026-07-30", 10.000004);
    expect(r.entryMinutes).toBe(10);
  });
});
