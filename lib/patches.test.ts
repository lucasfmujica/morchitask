import { describe, expect, it } from "vitest";
import {
  pickDailyNotePatch,
  pickObjectivePatch,
  pickProfilePatch,
  pickRoutineInput,
  pickSubtaskPatch,
  pickTaskPatch,
  pickWeeklyNotePatch,
} from "./patches";

/** Everything a hostile client could add to any patch. */
const HOSTILE = {
  id: "x",
  household_id: "x",
  owner_id_hostile: "x",
  user_id: "x",
  created_by: "x",
  created_at: "x",
  updated_at: "x",
  notification_prefs: { ai_usage: { count: 0 } },
};

describe("pickTaskPatch", () => {
  it("keeps the editable fields", () => {
    const patch = {
      title: "t",
      notes: null,
      channel_id: "c",
      time_estimate_min: 30,
      owner_id: "o",
      shared: true,
      objective_id: null,
      remind_at: "2026-01-01T10:00:00Z",
      reminder_sent_at: null,
      due_date: "2026-01-02",
      priority: "high",
    };
    expect(pickTaskPatch(patch)).toEqual(patch);
  });

  it("drops ids, household, creator, timestamps, server markers and personal time", () => {
    expect(
      pickTaskPatch({
        ...HOSTILE,
        actual_time_min: 999,
        gcal_event_id: "evt",
        stint_task_id: "s",
        status: "done",
        reminder_sent_at: "2026-01-01T00:00:00Z",
      }),
    ).toEqual({});
  });

  it("drops values of the wrong type instead of passing them to the database", () => {
    expect(pickTaskPatch({ title: 5, shared: "yes", time_estimate_min: "30" })).toEqual({});
  });

  it("survives garbage", () => {
    expect(pickTaskPatch(null)).toEqual({});
    expect(pickTaskPatch("x")).toEqual({});
  });
});

describe("other whitelists", () => {
  it("profile: no household, no prefs, avatar only cleared", () => {
    expect(pickProfilePatch({ ...HOSTILE, display_name: "n", avatar_url: "https://evil" })).toEqual(
      { display_name: "n" },
    );
    expect(pickProfilePatch({ avatar_url: null })).toEqual({ avatar_url: null });
  });

  it("notes: never the owner, the household or the date", () => {
    expect(
      pickDailyNotePatch({ ...HOSTILE, owner_id: "x", note_date: "x", reflection: "r" }),
    ).toEqual({ reflection: "r" });
    expect(pickWeeklyNotePatch({ ...HOSTILE, owner_id: "x", week_start: "x", wins: "w" })).toEqual({
      wins: "w",
    });
  });

  it("routines, subtasks, goals: only their own fields", () => {
    expect(pickRoutineInput({ ...HOSTILE, owner_id: "x", title: "r", weekdays: [1, 2] })).toEqual({
      title: "r",
      weekdays: [1, 2],
    });
    expect(pickSubtaskPatch({ ...HOSTILE, task_id: "x", done: true, title: "s" })).toEqual({
      title: "s",
    });
    expect(pickObjectivePatch({ ...HOSTILE, owner_id: "x", status: "done" })).toEqual({
      status: "done",
    });
  });
});
