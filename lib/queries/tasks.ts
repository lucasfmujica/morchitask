import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { profileKeys } from "./profiles";
import { syncTaskCalendar } from "./calendar";
import type { Profile, Task } from "./types";

export const taskKeys = {
  all: ["tasks"] as const,
  date: (d: string) => ["tasks", "date", d] as const,
  backlog: ["tasks", "backlog"] as const,
};

/** Which cached list a task belongs to (a day, or the backlog). */
function listKey(plannedDate: string | null) {
  return plannedDate ? taskKeys.date(plannedDate) : taskKeys.backlog;
}

const bySortOrder = (a: Task, b: Task) => a.sort_order - b.sort_order;

/** PostgREST filter: tasks I own OR tasks shared with me. */
function mineOrShared(userId: string) {
  return `owner_id.eq.${userId},shared.eq.true`;
}

async function currentUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
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
    queryFn: async (): Promise<Task[]> => {
      const supabase = createClient();
      const uid = await currentUserId();
      let q = supabase.from("tasks").select("*").eq("planned_date", date);
      if (uid) q = q.or(mineOrShared(uid));
      const { data, error } = await q.order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
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
      const supabase = createClient();
      const uid = await currentUserId();
      let q = supabase
        .from("tasks")
        .select("planned_date, status")
        .gte("planned_date", startDate)
        .lte("planned_date", endDate);
      if (uid) q = q.or(mineOrShared(uid));
      const { data, error } = await q;
      if (error) throw error;

      const counts = new Map<string, DayCount>();
      for (const row of data) {
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
    queryFn: async (): Promise<Task[]> => {
      const supabase = createClient();
      const uid = await currentUserId();
      let q = supabase.from("tasks").select("*").is("planned_date", null);
      if (uid) q = q.or(mineOrShared(uid));
      const { data, error } = await q.order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
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
    queryFn: async (): Promise<AnalyticsTask[]> => {
      const supabase = createClient();
      const uid = await currentUserId();
      let q = supabase
        .from("tasks")
        .select("planned_date, status, time_estimate_min, actual_time_min, channel_id, owner_id")
        .gte("planned_date", start)
        .lte("planned_date", end);
      if (uid) q = q.or(mineOrShared(uid));
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  };
}

// ------------------------------------------------------------ mutations

export type NewTask = {
  title: string;
  plannedDate: string | null;
  channelId?: string | null;
  timeEstimateMin?: number | null;
  sortOrder: number;
};

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
    mutationFn: async (input: NewTask): Promise<Task> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title: input.title,
          planned_date: input.plannedDate,
          channel_id: input.channelId ?? null,
          time_estimate_min: input.timeEstimateMin ?? null,
          sort_order: input.sortOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
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
    mutationFn: async (task: Task): Promise<Task> => {
      const supabase = createClient();
      const done = task.status !== "done";
      const { data, error } = await supabase
        .from("tasks")
        .update({
          status: done ? "done" : "todo",
          completed_at: done ? new Date().toISOString() : null,
        })
        .eq("id", task.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
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

type TaskPatch = Pick<
  TablesUpdate<"tasks">,
  | "title"
  | "notes"
  | "channel_id"
  | "time_estimate_min"
  | "actual_time_min"
  | "block_start"
  | "block_end"
  | "owner_id"
  | "shared"
  | "objective_id"
  | "gcal_event_id"
  | "remind_at"
  | "reminder_sent_at"
>;

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ task, patch }: { task: Task; patch: TaskPatch }): Promise<Task> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", task.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
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
    mutationFn: async ({
      taskId,
      actualMin,
    }: {
      taskId: string;
      plannedDate: string | null;
      actualMin: number;
    }): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase
        .from("tasks")
        .update({ actual_time_min: actualMin })
        .eq("id", taskId);
      if (error) throw error;
    },
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
 * juggling here. Only meaningful for shared tasks (RLS hides the rest).
 */
export async function setTaskActiveSince(taskId: string, active: boolean): Promise<void> {
  const supabase = createClient();
  await supabase
    .from("tasks")
    .update({ active_since: active ? new Date().toISOString() : null })
    .eq("id", taskId);
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: Task): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
      // Remove its Google Calendar event too (only if it was ever synced).
      if (task.gcal_event_id) {
        syncTaskCalendar({ action: "delete", eventId: task.gcal_event_id }).catch(() => {});
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
    onSettled: (_d, _e, task) => qc.invalidateQueries({ queryKey: listKey(task.planned_date) }),
  });
}

/** Move a task to a different day (Week drag-and-drop). Clears any time-block. */
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
      const supabase = createClient();
      const { error } = await supabase
        .from("tasks")
        .update({ planned_date: toDate, sort_order: sortOrder, block_start: null, block_end: null })
        .eq("id", task.id);
      if (error) throw error;
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
    },
  });
}

export function useReorderTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ task, sortOrder }: { task: Task; sortOrder: number }): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase
        .from("tasks")
        .update({ sort_order: sortOrder })
        .eq("id", task.id);
      if (error) throw error;
    },
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
