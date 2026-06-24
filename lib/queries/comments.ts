import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { TaskComment } from "./types";

export const commentKeys = {
  task: (taskId: string) => ["comments", taskId] as const,
};

/** Comments on a task, oldest first. Visible to both household members (RLS). */
export function useComments(taskId: string) {
  return useQuery({
    queryKey: commentKeys.task(taskId),
    queryFn: async (): Promise<TaskComment[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string): Promise<TaskComment> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_comments")
        .insert({ task_id: taskId, body })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: commentKeys.task(taskId) }),
  });
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase.from("task_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: commentKeys.task(taskId) });
      const prev = qc.getQueryData<TaskComment[]>(commentKeys.task(taskId));
      qc.setQueryData<TaskComment[]>(commentKeys.task(taskId), (old = []) =>
        old.filter((c) => c.id !== id),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(commentKeys.task(taskId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: commentKeys.task(taskId) }),
  });
}
