import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addReaction, getReactions, removeReaction } from "@/lib/actions/reactions";
import type { TaskReaction } from "./types";

/** The kudos palette offered on a completed shared task. */
export const REACTION_EMOJIS = ["👏", "🔥", "❤️", "🎉"] as const;

export const reactionKeys = {
  task: (taskId: string) => ["reactions", taskId] as const,
};

/** Reactions on a task. Both household members can see and add their own. */
export function useReactions(taskId: string) {
  return useQuery({
    queryKey: reactionKeys.task(taskId),
    queryFn: (): Promise<TaskReaction[]> => getReactions(taskId),
  });
}

/**
 * Toggle my reaction with a given emoji on a task. Adds it if absent, removes
 * it if I already reacted with that emoji. `mine` is the caller's reaction of
 * that emoji (or undefined).
 */
export function useToggleReaction(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ emoji, mine }: { emoji: string; mine?: TaskReaction }): Promise<void> => {
      if (mine) {
        await removeReaction(mine.id);
      } else {
        await addReaction(taskId, emoji);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: reactionKeys.task(taskId) }),
  });
}
