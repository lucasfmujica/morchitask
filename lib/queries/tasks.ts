import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { profileKeys } from "./profiles";
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

export function useBacklogTasks() {
  return useQuery({
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
  });
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
  | "block_start"
  | "block_end"
  | "owner_id"
  | "shared"
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

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: Task): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
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
