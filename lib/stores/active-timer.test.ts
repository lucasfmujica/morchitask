import { describe, it, expect, beforeEach } from "vitest";
import {
  activeTimerStorageKey,
  bindActiveTimersToUser,
  clearActiveTimersForSignOut,
  elapsedSeconds,
  migrateActiveTimers,
  useActiveTimers,
  type ActiveTimer,
} from "./active-timer";

function timer(taskId: string, startedAt = 1_000): ActiveTimer {
  return { taskId, title: taskId, plannedDate: null, baseActualMin: 0, startedAt };
}

describe("elapsedSeconds", () => {
  it("floors to whole seconds", () => {
    expect(elapsedSeconds(0, 90_000)).toBe(90); // 1m30s
    expect(elapsedSeconds(0, 89_900)).toBe(89); // 1m29.9s → 89s
  });
  it("never returns negative", () => {
    expect(elapsedSeconds(100_000, 0)).toBe(0);
  });
  it("keeps sub-minute runs (no longer lost)", () => {
    expect(elapsedSeconds(0, 5_000)).toBe(5);
    expect(elapsedSeconds(0, 1_000)).toBe(1);
  });
});

describe("migrateActiveTimers", () => {
  it("carries a v0 single timer into the record (a running timer survives the upgrade)", () => {
    const legacy = timer("task-1", 42);
    expect(migrateActiveTimers({ active: legacy }, 0)).toEqual({ timers: { "task-1": legacy } });
  });

  it("turns an idle v0 state into an empty record", () => {
    expect(migrateActiveTimers({ active: null }, 0)).toEqual({ timers: {} });
    expect(migrateActiveTimers(null, 0)).toEqual({ timers: {} });
  });

  it("passes a v1 state through, dropping malformed entries", () => {
    const good = timer("ok");
    expect(migrateActiveTimers({ timers: { ok: good, bad: { nope: 1 } } }, 1)).toEqual({
      timers: { ok: good },
    });
  });

  it("survives garbage", () => {
    expect(migrateActiveTimers(undefined, 1)).toEqual({ timers: {} });
    expect(migrateActiveTimers("nonsense", 0)).toEqual({ timers: {} });
  });
});

describe("useActiveTimers", () => {
  beforeEach(() => useActiveTimers.getState().clearAll());

  it("runs several tasks at once", () => {
    const { start } = useActiveTimers.getState();
    start(timer("a"));
    start(timer("b"));
    expect(Object.keys(useActiveTimers.getState().timers)).toEqual(["a", "b"]);
  });

  it("ignores a re-start so a double tap can't reset the clock", () => {
    const { start } = useActiveTimers.getState();
    start(timer("a", 1_000));
    start(timer("a", 9_999));
    expect(useActiveTimers.getState().timers.a.startedAt).toBe(1_000);
  });

  it("stops only the task named", () => {
    const { start, stop } = useActiveTimers.getState();
    start(timer("a"));
    start(timer("b"));
    stop("a");
    expect(Object.keys(useActiveTimers.getState().timers)).toEqual(["b"]);
  });

  it("is a no-op when stopping a task that isn't running", () => {
    const { start, stop } = useActiveTimers.getState();
    start(timer("a"));
    const before = useActiveTimers.getState().timers;
    stop("ghost");
    expect(useActiveTimers.getState().timers).toBe(before); // same ref, no re-render
  });

  it("clearAll empties the record", () => {
    const { start, clearAll } = useActiveTimers.getState();
    start(timer("a"));
    start(timer("b"));
    clearAll();
    expect(useActiveTimers.getState().timers).toEqual({});
  });
});

describe("timers per account on one device", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  beforeEach(() => {
    clearActiveTimersForSignOut();
    localStorage.clear();
  });

  it("stores timers under the signed-in user's own key", async () => {
    bindActiveTimersToUser("user-a");
    await flush();
    useActiveTimers.getState().start(timer("a-task"));
    expect(localStorage.getItem(activeTimerStorageKey("user-a"))).toContain("a-task");
    expect(localStorage.getItem(activeTimerStorageKey(null))).toBeNull();
  });

  it("never shows one account's running timer to the next one", async () => {
    bindActiveTimersToUser("user-a");
    await flush();
    useActiveTimers.getState().start(timer("a-task"));

    bindActiveTimersToUser("user-b");
    await flush();
    expect(useActiveTimers.getState().timers).toEqual({});

    // And A gets theirs back when they return.
    bindActiveTimersToUser("user-a");
    await flush();
    expect(Object.keys(useActiveTimers.getState().timers)).toEqual(["a-task"]);
  });

  it("signing out clears the timers and what was stored for them", async () => {
    bindActiveTimersToUser("user-a");
    await flush();
    useActiveTimers.getState().start(timer("a-task"));

    clearActiveTimersForSignOut();
    expect(useActiveTimers.getState().timers).toEqual({});
    expect(localStorage.getItem(activeTimerStorageKey("user-a"))).toBeNull();
  });

  it("drops the old shared key instead of handing it to whoever signs in", async () => {
    localStorage.setItem(
      activeTimerStorageKey(null),
      JSON.stringify({ state: { timers: { old: timer("old") } }, version: 1 }),
    );
    bindActiveTimersToUser("user-b");
    await flush();
    expect(useActiveTimers.getState().timers).toEqual({});
    expect(localStorage.getItem(activeTimerStorageKey(null))).toBeNull();
  });
});
