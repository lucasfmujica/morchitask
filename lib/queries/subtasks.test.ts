import { describe, it, expect } from "vitest";
import { groupSubtasksByTask } from "./subtasks";
import type { Subtask } from "./types";

function sub(id: string, taskId: string): Subtask {
  return { id, task_id: taskId, title: id, done: false, sort_order: 0 } as unknown as Subtask;
}

describe("groupSubtasksByTask", () => {
  it("groups subtasks by their parent task id", () => {
    const map = groupSubtasksByTask([sub("a", "t1"), sub("b", "t2"), sub("c", "t1")]);
    expect(map.get("t1")?.map((s) => s.id)).toEqual(["a", "c"]);
    expect(map.get("t2")?.map((s) => s.id)).toEqual(["b"]);
    expect(map.size).toBe(2);
  });

  it("preserves input order within a task", () => {
    const map = groupSubtasksByTask([sub("x", "t"), sub("y", "t"), sub("z", "t")]);
    expect(map.get("t")?.map((s) => s.id)).toEqual(["x", "y", "z"]);
  });

  it("returns an empty map when there are no subtasks", () => {
    expect(groupSubtasksByTask([]).size).toBe(0);
  });
});
