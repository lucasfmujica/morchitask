import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
    queryFn: async (): Promise<TaskReaction[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("task_reactions")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
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
      const supabase = createClient();
      if (mine) {
        const { error } = await supabase.from("task_reactions").delete().eq("id", mine.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("task_reactions").insert({ task_id: taskId, emoji });
        if (error) throw error;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: reactionKeys.task(taskId) }),
  });
}
