import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTask as createTaskAction,
  deleteTask as deleteTaskAction,
  moveTaskToDate as moveTaskToDateAction,
  reorderTask as reorderTaskAction,
  setActualTime as setActualTimeAction,
  setTaskActiveSince as setTaskActiveSinceAction,
  toggleTask as toggleTaskAction,
  updateTask as updateTaskAction,
} from "@/lib/actions/tasks";
import { profileKeys } from "./profiles";
import { syncBlockCalendar } from "./calendar";
import type { NewTask, Profile, Task, TaskPatch } from "./types";

export const taskKeys = {
  all: ["tasks"] as const,
  date: (d: string) => ["tasks", "date", d] as const,
  backlog: ["tasks", "backlog"] as const,
};

export type { NewTask, TaskPatch };

/** Which cached list a task belongs to (a day, or the backlog). */
function listKey(plannedDate: string | null) {
  return plannedDate ? taskKeys.date(plannedDate) : taskKeys.backlog;
}

const bySortOrder = (a: Task, b: Task) => a.sort_order - b.sort_order;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`request to ${url} failed: ${res.status}`);
  return res.json();
}

// ------------------------------------------------------------ queries

/**
 * Query options for one day's tasks. Shared by the Day view (useQuery) and the
 * Week view (useQueries) so both read the SAME cache key — mutations that update
 * a day stay coherent across views with no duplication.
 */
export function tasksForDateQueryOptions(date: string) {
  return {
    queryKey: taskKeys.date(date),
    queryFn: () => fetchJson<Task[]>(`/api/tasks?date=${date}`),
  };
}

export function useTasksForDate(date: string) {
  return useQuery(tasksForDateQueryOptions(date));
}

export type DayCount = { total: number; done: number };

/**
 * Per-day task counts across a date range (for the Month grid). Fetches only
 * planned_date + status (bounded by the visible grid), aggregated client-side.
 */
export function useMonthCounts(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["tasks", "counts", startDate, endDate],
    queryFn: async (): Promise<Map<string, DayCount>> => {
      const rows = await fetchJson<Pick<Task, "planned_date" | "status">[]>(
        `/api/tasks/counts?start=${startDate}&end=${endDate}`,
      );
      const counts = new Map<string, DayCount>();
      for (const row of rows) {
        if (!row.planned_date) continue;
        const entry = counts.get(row.planned_date) ?? { total: 0, done: 0 };
        entry.total += 1;
        if (row.status === "done") entry.done += 1;
        counts.set(row.planned_date, entry);
      }
      return counts;
    },
    staleTime: 30_000,
  });
}

/** Query options for the backlog list. Shared by the Backlog view and the task
 *  detail sheet (which reads the same cache to stay live as the task is edited). */
export function backlogQueryOptions() {
  return {
    queryKey: taskKeys.backlog,
    queryFn: () => fetchJson<Task[]>("/api/tasks?backlog=1"),
  };
}

export function useBacklogTasks() {
  return useQuery(backlogQueryOptions());
}

/** Lightweight task shape for analytics (one query over a date range). */
export type AnalyticsTask = Pick<
  Task,
  "planned_date" | "status" | "time_estimate_min" | "actual_time_min" | "channel_id" | "owner_id"
>;

/**
 * All tasks planned within [start, end] (inclusive ISO days) in ONE query —
 * for the historical analytics in Resumen. Fetches only the columns the
 * aggregations need so a month's range stays light.
 */
export function tasksInRangeQueryOptions(start: string, end: string) {
  return {
    queryKey: ["tasks", "range", start, end] as const,
    queryFn: () => fetchJson<AnalyticsTask[]>(`/api/tasks/range?start=${start}&end=${end}`),
    staleTime: 30_000,
  };
}

// ------------------------------------------------------------ mutations

function buildOptimisticTask(input: NewTask, ownerId: string, householdId: string): Task {
  const now = new Date().toISOString();
  return {
    id: `temp-${crypto.randomUUID()}`,
    household_id: householdId,
    owner_id: ownerId,
    channel_id: input.channelId ?? null,
    title: input.title,
    notes: null,
    planned_date: input.plannedDate,
    due_date: null,
    sort_order: input.sortOrder,
    status: "todo",
    completed_at: null,
    time_estimate_min: input.timeEstimateMin ?? null,
    actual_time_min: null,
    block_start: null,
    block_end: null,
    rollover_origin_date: null,
    rollover_count: 0,
    shared: false,
    template_id: null,
    template_date: null,
    objective_id: null,
    gcal_event_id: null,
    gcal_synced_at: null,
    remind_at: null,
    reminder_sent_at: null,
    active_since: null,
    created_by: ownerId,
    created_at: now,
    updated_at: now,
  };
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTask): Promise<Task> => createTaskAction(input),
    onMutate: async (input) => {
      const key = listKey(input.plannedDate);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Task[]>(key);
      const me = qc.getQueryData<Profile | null>(profileKeys.me);
      const temp = buildOptimisticTask(input, me?.id ?? "", me?.household_id ?? "");
      qc.setQueryData<Task[]>(key, (old = []) => [...old, temp].sort(bySortOrder));
      return { key, prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, input) => qc.invalidateQueries({ queryKey: listKey(input.plannedDate) }),
  });
}

export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (task: Task): Promise<Task> => toggleTaskAction(task.id, task.status !== "done"),
    onMutate: async (task) => {
      const key = listKey(task.planned_date);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Task[]>(key);
      const done = task.status !== "done";
      qc.setQueryData<Task[]>(key, (old = []) =>
        old.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: done ? "done" : "todo",
                completed_at: done ? new Date().toISOString() : null,
              }
            : t,
        ),
      );
      return { key, prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, task) => qc.invalidateQueries({ queryKey: listKey(task.planned_date) }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ task, patch }: { task: Task; patch: TaskPatch }): Promise<Task> =>
      updateTaskAction(task.id, patch),
    onMutate: async ({ task, patch }) => {
      const key = listKey(task.planned_date);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Task[]>(key);
      qc.setQueryData<Task[]>(key, (old = []) =>
        old.map((t) => (t.id === task.id ? { ...t, ...patch } : t)),
      );
      return { key, prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, { task }) => qc.invalidateQueries({ queryKey: listKey(task.planned_date) }),
  });
}

/** Set a task's actual (tracked) time. Used when a stopwatch is stopped. */
export function useSetActualTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      actualMin,
    }: {
      taskId: string;
      plannedDate: string | null;
      actualMin: number;
    }) => setActualTimeAction(taskId, actualMin),
    onMutate: async ({ taskId, plannedDate, actualMin }) => {
      const key = listKey(plannedDate);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Task[]>(key);
      qc.setQueryData<Task[]>(key, (old = []) =>
        old.map((t) => (t.id === taskId ? { ...t, actual_time_min: actualMin } : t)),
      );
      return { key, prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, { plannedDate }) =>
      qc.invalidateQueries({ queryKey: listKey(plannedDate) }),
  });
}

/**
 * Mark/unmark a task as currently being worked on, so a partner can see "X is
 * on this now". Fire-and-forget — presence reads its own query, so no cache
 * juggling here. Only meaningful for shared tasks (household-scoped server
 * check hides the rest).
 */
export async function setTaskActiveSince(taskId: string, active: boolean): Promise<void> {
  await setTaskActiveSinceAction(taskId, active);
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: Task): Promise<void> => {
      const { eventIds } = await deleteTaskAction(task.id);
      for (const eventId of eventIds) {
        syncBlockCalendar({ action: "delete", eventId }).catch(() => {});
      }
    },
    onMutate: async (task) => {
      const key = listKey(task.planned_date);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Task[]>(key);
      qc.setQueryData<Task[]>(key, (old = []) => old.filter((t) => t.id !== task.id));
      return { key, prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, task) => {
      qc.invalidateQueries({ queryKey: listKey(task.planned_date) });
      if (task.planned_date) {
        qc.invalidateQueries({ queryKey: ["blocks", "date", task.planned_date] });
      }
    },
  });
}

/** Move a task to a different day (Week drag-and-drop). Drops its time-blocks
 *  (they belonged to the old day); the DB trigger clears block_start/end. */
export function useMoveTaskToDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      task,
      toDate,
      sortOrder,
    }: {
      task: Task;
      toDate: string;
      sortOrder: number;
    }): Promise<void> => {
      const { eventIds } = await moveTaskToDateAction(task.id, toDate, sortOrder);
      for (const eventId of eventIds) {
        syncBlockCalendar({ action: "delete", eventId }).catch(() => {});
      }
    },
    onMutate: async ({ task, toDate, sortOrder }) => {
      const fromKey = listKey(task.planned_date);
      const toKey = listKey(toDate);
      await Promise.all([
        qc.cancelQueries({ queryKey: fromKey }),
        qc.cancelQueries({ queryKey: toKey }),
      ]);
      const prevFrom = qc.getQueryData<Task[]>(fromKey);
      const prevTo = qc.getQueryData<Task[]>(toKey);
      qc.setQueryData<Task[]>(fromKey, (old = []) => old.filter((t) => t.id !== task.id));
      const moved = {
        ...task,
        planned_date: toDate,
        sort_order: sortOrder,
        block_start: null,
        block_end: null,
      };
      qc.setQueryData<Task[]>(toKey, (old = []) =>
        [...old.filter((t) => t.id !== task.id), moved].sort(bySortOrder),
      );
      return { fromKey, toKey, prevFrom, prevTo };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) {
        qc.setQueryData(ctx.fromKey, ctx.prevFrom);
        qc.setQueryData(ctx.toKey, ctx.prevTo);
      }
    },
    onSettled: (_d, _e, { task, toDate }) => {
      qc.invalidateQueries({ queryKey: listKey(task.planned_date) });
      qc.invalidateQueries({ queryKey: listKey(toDate) });
      if (task.planned_date) {
        qc.invalidateQueries({ queryKey: ["blocks", "date", task.planned_date] });
      }
    },
  });
}

export function useReorderTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ task, sortOrder }: { task: Task; sortOrder: number }) =>
      reorderTaskAction(task.id, sortOrder),
    onMutate: async ({ task, sortOrder }) => {
      const key = listKey(task.planned_date);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Task[]>(key);
      qc.setQueryData<Task[]>(key, (old = []) =>
        old.map((t) => (t.id === task.id ? { ...t, sort_order: sortOrder } : t)).sort(bySortOrder),
      );
      return { key, prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, { task }) => qc.invalidateQueries({ queryKey: listKey(task.planned_date) }),
  });
}
