import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { Task } from "./types";

// Only the pure `patchList` helper is exercised here, so the server-only
// Server Action modules (Auth.js / DB clients) are stubbed rather than loaded.
vi.mock("@/lib/actions/tasks", () => ({}));
vi.mock("@/lib/actions/profiles", () => ({}));
vi.mock("@/lib/actions/task-blocks", () => ({}));
vi.mock("@/lib/actions/google", () => ({}));

const { patchList } = await import("./tasks");

const KEY = ["tasks", "date", "2026-07-28"] as const;

function task(id: string, title = id): Task {
  return { id, title, status: "todo", sort_order: 0 } as unknown as Task;
}

describe("patchList", () => {
  it("applies the patch and returns the previous list when the key is cached", () => {
    const qc = new QueryClient();
    qc.setQueryData<Task[]>(KEY, [task("a"), task("b")]);

    const prev = patchList(qc, KEY, (tasks) => tasks.filter((t) => t.id !== "a"));

    expect(prev?.map((t) => t.id)).toEqual(["a", "b"]);
    expect(qc.getQueryData<Task[]>(KEY)?.map((t) => t.id)).toEqual(["b"]);
  });

  it("does NOT seed a key that was never cached", () => {
    const qc = new QueryClient();

    const prev = patchList(qc, KEY, (tasks) => tasks.map((t) => ({ ...t, status: "done" })));

    // The whole point: an uncached day stays uncached, so it refetches on mount
    // instead of rendering a phantom empty list.
    expect(prev).toBeUndefined();
    expect(qc.getQueryData(KEY)).toBeUndefined();
  });

  it("patches an empty cached list without seeding anything new", () => {
    const qc = new QueryClient();
    qc.setQueryData<Task[]>(KEY, []);

    const prev = patchList(qc, KEY, (tasks) => [...tasks, task("new")]);

    // An empty array IS a cached value — a genuinely empty day must still patch.
    expect(prev).toEqual([]);
    expect(qc.getQueryData<Task[]>(KEY)?.map((t) => t.id)).toEqual(["new"]);
  });

  it("leaves the cached array untouched so rollback has something to restore", () => {
    const qc = new QueryClient();
    const original = [task("a"), task("b")];
    qc.setQueryData<Task[]>(KEY, original);

    const prev = patchList(qc, KEY, (tasks) => tasks.map((t) => ({ ...t, title: "changed" })));

    expect(prev).toBe(original);
    expect(original.map((t) => t.title)).toEqual(["a", "b"]);
  });
});
