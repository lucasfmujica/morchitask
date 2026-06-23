import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Subtask } from "./types";

export const subtaskKeys = {
  /** One task's checklist (used by the task detail sheet). */
  task: (taskId: string) => ["subtasks", taskId] as const,
  /** All checklist items for tasks planned on a given day (used by the cards). */
  date: (date: string) => ["subtasks", "date", date] as const,
  /** Prefix that matches every per-day cache, for broad invalidation. */
  dateAll: ["subtasks", "date"] as const,
};

/** Group a flat list of subtasks by their parent task id. Pure → unit-tested. */
export function groupSubtasksByTask(subtasks: Subtask[]): Map<string, Subtask[]> {
  const map = new Map<string, Subtask[]>();
  for (const s of subtasks) {
    const arr = map.get(s.task_id);
    if (arr) arr.push(s);
    else map.set(s.task_id, [s]);
  }
  return map;
}

// ------------------------------------------------------------ per-task (detail sheet)

export function useSubtasks(taskId: string) {
  return useQuery({
    queryKey: subtaskKeys.task(taskId),
    queryFn: async (): Promise<Subtask[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subtasks")
        .select("*")
        .eq("task_id", taskId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; sortOrder: number }): Promise<Subtask> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subtasks")
        .insert({ task_id: taskId, title: input.title, sort_order: input.sortOrder })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: subtaskKeys.task(taskId) });
      qc.invalidateQueries({ queryKey: subtaskKeys.dateAll });
    },
  });
}

export function useToggleSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sub: Subtask): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase
        .from("subtasks")
        .update({ done: !sub.done })
        .eq("id", sub.id);
      if (error) throw error;
    },
    onMutate: async (sub) => {
      await qc.cancelQueries({ queryKey: subtaskKeys.task(taskId) });
      const prev = qc.getQueryData<Subtask[]>(subtaskKeys.task(taskId));
      qc.setQueryData<Subtask[]>(subtaskKeys.task(taskId), (old = []) =>
        old.map((s) => (s.id === sub.id ? { ...s, done: !s.done } : s)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(subtaskKeys.task(taskId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: subtaskKeys.task(taskId) });
      qc.invalidateQueries({ queryKey: subtaskKeys.dateAll });
    },
  });
}

export function useDeleteSubtask(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase.from("subtasks").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: subtaskKeys.task(taskId) });
      const prev = qc.getQueryData<Subtask[]>(subtaskKeys.task(taskId));
      qc.setQueryData<Subtask[]>(subtaskKeys.task(taskId), (old = []) =>
        old.filter((s) => s.id !== id),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(subtaskKeys.task(taskId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: subtaskKeys.task(taskId) });
      qc.invalidateQueries({ queryKey: subtaskKeys.dateAll });
    },
  });
}

// ------------------------------------------------------------ per-day (task cards)

/**
 * One query per day that returns every checklist item for that day's tasks,
 * grouped by task id. Avoids an N+1 of per-task fetches when many cards are
 * shown (Day list, Week columns). Shares the join-by-planned_date with the
 * tasks-by-date query so both stay scoped to the same day.
 */
export function subtasksForDateQueryOptions(date: string) {
  return {
    queryKey: subtaskKeys.date(date),
    queryFn: async (): Promise<Map<string, Subtask[]>> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subtasks")
        .select("*, tasks!inner(planned_date)")
        .eq("tasks.planned_date", date)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      // Drop the embedded `tasks` relation; keep the plain Subtask shape.
      const rows: Subtask[] = (data ?? []).map((row) => {
        const rest = { ...(row as Record<string, unknown>) };
        delete rest.tasks;
        return rest as unknown as Subtask;
      });
      return groupSubtasksByTask(rows);
    },
  };
}

export function useSubtasksForDate(date: string) {
  return useQuery(subtasksForDateQueryOptions(date));
}

/** Toggle a checklist item from a card; optimistic on the per-day cache. */
export function useToggleSubtaskByDate(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sub: Subtask): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase
        .from("subtasks")
        .update({ done: !sub.done })
        .eq("id", sub.id);
      if (error) throw error;
    },
    onMutate: async (sub) => {
      const dKey = subtaskKeys.date(date);
      await qc.cancelQueries({ queryKey: dKey });
      const prev = qc.getQueryData<Map<string, Subtask[]>>(dKey);
      qc.setQueryData<Map<string, Subtask[]>>(dKey, (old) => {
        if (!old) return old;
        const next = new Map(old);
        const arr = next.get(sub.task_id);
        if (arr) {
          next.set(
            sub.task_id,
            arr.map((s) => (s.id === sub.id ? { ...s, done: !s.done } : s)),
          );
        }
        return next;
      });
      // Keep an open detail sheet (per-task cache) in sync, if present.
      const tKey = subtaskKeys.task(sub.task_id);
      const prevTask = qc.getQueryData<Subtask[]>(tKey);
      if (prevTask) {
        qc.setQueryData<Subtask[]>(
          tKey,
          prevTask.map((s) => (s.id === sub.id ? { ...s, done: !s.done } : s)),
        );
      }
      return { prev, prevTask };
    },
    onError: (_e, sub, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(subtaskKeys.date(date), ctx.prev);
      if (ctx?.prevTask !== undefined) qc.setQueryData(subtaskKeys.task(sub.task_id), ctx.prevTask);
    },
    onSettled: (_d, _e, sub) => {
      qc.invalidateQueries({ queryKey: subtaskKeys.date(date) });
      qc.invalidateQueries({ queryKey: subtaskKeys.task(sub.task_id) });
    },
  });
}
