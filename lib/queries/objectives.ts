import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createObjective as createObjectiveAction,
  deleteObjective as deleteObjectiveAction,
  getObjectiveTaskCounts,
  getObjectives,
  updateObjective as updateObjectiveAction,
} from "@/lib/actions/objectives";
import type { Objective } from "./types";

export const objectiveKeys = {
  all: ["objectives"] as const,
  progress: ["objectives", "progress"] as const,
};

/** Household objectives (newest deadline first), excluding archived ones. */
export function useObjectives() {
  return useQuery({
    queryKey: objectiveKeys.all,
    queryFn: (): Promise<Objective[]> => getObjectives(),
    staleTime: 5 * 60_000,
  });
}

export type ObjectiveProgress = { done: number; total: number };

/**
 * Done/total task counts per objective (for progress bars). One query over all
 * linked tasks, aggregated client-side — mirrors `useMonthCounts`.
 */
export function useObjectiveProgress() {
  return useQuery({
    queryKey: objectiveKeys.progress,
    queryFn: async (): Promise<Map<string, ObjectiveProgress>> => {
      const rows = await getObjectiveTaskCounts();
      const counts = new Map<string, ObjectiveProgress>();
      for (const row of rows) {
        if (!row.objective_id) continue;
        const entry = counts.get(row.objective_id) ?? { done: 0, total: 0 };
        entry.total += 1;
        if (row.status === "done") entry.done += 1;
        counts.set(row.objective_id, entry);
      }
      return counts;
    },
    staleTime: 30_000,
  });
}

export function useCreateObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; period: string; start_date: string; end_date: string }) =>
      createObjectiveAction(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: objectiveKeys.all }),
  });
}

type ObjectivePatch = { title?: string; status?: string; sort_order?: number };

export function useUpdateObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ObjectivePatch }) =>
      updateObjectiveAction(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: objectiveKeys.all }),
  });
}

export function useDeleteObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteObjectiveAction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: objectiveKeys.all });
      qc.invalidateQueries({ queryKey: objectiveKeys.progress });
      qc.invalidateQueries({ queryKey: ["tasks"] }); // linked tasks lose their objective_id
    },
  });
}
