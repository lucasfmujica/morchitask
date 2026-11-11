import { describe, expect, it } from "vitest";
import {
  canLinkStint,
  localTitle,
  planSync,
  pushFor,
  type LocalLinked,
  type RemoteTask,
} from "./stint";

const now = new Date("2026-11-11T15:00:00Z");
const remote = (over: Partial<RemoteTask> = {}): RemoteTask => ({
  id: "r1",
  title: "Posteo",
  status: "todo",
  client: "La Perfecta",
  deadline: "2026-11-13",
  url: "https://stint.example/rhea/tasks/r1",
  ...over,
});
const local = (over: Partial<LocalLinked> = {}): LocalLinked => ({
  id: "l1",
  stint_task_id: "r1",
  stint_status: "todo",
  status: "todo",
  title: "La Perfecta · Posteo",
  due_date: "2026-11-13",
  notes: "https://stint.example/rhea/tasks/r1",
  hasTime: false,
  ...over,
});

describe("canLinkStint", () => {
  it("only lets listed emails in", () => {
    expect(canLinkStint("Sofi@x.com", "a@b.com, sofi@x.com")).toBe(true);
    expect(canLinkStint("lucas@x.com", "sofi@x.com")).toBe(false);
    expect(canLinkStint("sofi@x.com", undefined)).toBe(false);
  });
});

describe("planSync", () => {
  it("creates open tasks it hasn't seen, and skips ones already done", () => {
    const plan = planSync([remote(), remote({ id: "r2", status: "done" })], [], now);
    expect(plan.create.map((r) => r.id)).toEqual(["r1"]);
  });

  it("does nothing when nothing changed", () => {
    expect(planSync([remote()], [local()], now)).toEqual({
      create: [],
      update: [],
      remove: [],
      unlink: [],
    });
  });

  it("follows Stint's title and deadline", () => {
    const plan = planSync([remote({ title: "Reel", deadline: "2026-11-12" })], [local()], now);
    expect(plan.update).toEqual([
      {
        id: "l1",
        set: { stint_status: "todo", title: "La Perfecta · Reel", due_date: "2026-11-12" },
      },
    ]);
  });

  it("marks done here when it was finished there", () => {
    const plan = planSync([remote({ status: "done" })], [local({ stint_status: "doing" })], now);
    expect(plan.update[0].set).toMatchObject({ status: "done", stint_status: "done" });
  });

  it("reopens here when it was reopened there", () => {
    const plan = planSync(
      [remote({ status: "doing" })],
      [local({ status: "done", stint_status: "done" })],
      now,
    );
    expect(plan.update[0].set).toMatchObject({ status: "todo", completed_at: null });
  });

  it("does not undo a local done whose push hasn't landed", () => {
    // Done here, Stint still says todo, and todo is what we last saw there.
    const plan = planSync([remote()], [local({ status: "done" })], now);
    expect(plan.update).toEqual([]);
  });

  it("records a status change there that needs no local change", () => {
    const plan = planSync([remote({ status: "review" })], [local({ stint_status: "doing" })], now);
    expect(plan.update).toEqual([{ id: "l1", set: { stint_status: "review" } }]);
  });

  it("removes an untouched task taken away, and keeps one with work in it", () => {
    const plan = planSync(
      [],
      [
        local(),
        local({ id: "l2", stint_task_id: "r2", hasTime: true }),
        local({ id: "l3", stint_task_id: "r3", status: "done" }),
      ],
      now,
    );
    expect(plan.remove).toEqual(["l1"]);
    expect(plan.unlink).toEqual(["l2", "l3"]);
  });
});

describe("localTitle", () => {
  it("puts the client first when there is one", () => {
    expect(localTitle({ title: "Posteo", client: null })).toBe("Posteo");
  });
});

describe("pushFor", () => {
  it("moves a todo to doing when the timer starts, and nothing else", () => {
    expect(pushFor("timerStarted", "todo")).toBe("doing");
    expect(pushFor("timerStarted", "review")).toBeNull();
    expect(pushFor("timerStarted", "doing")).toBeNull();
  });
  it("finishes and reopens", () => {
    expect(pushFor("done", "doing")).toBe("done");
    expect(pushFor("done", "done")).toBeNull();
    expect(pushFor("undone", "done")).toBe("doing");
    expect(pushFor("undone", "doing")).toBeNull();
  });
});
