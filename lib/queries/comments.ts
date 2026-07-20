import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addComment as addCommentAction,
  deleteComment as deleteCommentAction,
  getComments,
} from "@/lib/actions/comments";
import type { TaskComment } from "./types";

export const commentKeys = {
  task: (taskId: string) => ["comments", taskId] as const,
};

/** Comments on a task, oldest first. Visible to both household members. */
export function useComments(taskId: string) {
  return useQuery({
    queryKey: commentKeys.task(taskId),
    queryFn: (): Promise<TaskComment[]> => getComments(taskId),
  });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string): Promise<TaskComment> => addCommentAction(taskId, body),
    onSettled: () => qc.invalidateQueries({ queryKey: commentKeys.task(taskId) }),
  });
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<void> => deleteCommentAction(id),
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
