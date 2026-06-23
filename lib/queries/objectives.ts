import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import type { Objective } from "./types";

export const objectiveKeys = {
  all: ["objectives"] as const,
  progress: ["objectives", "progress"] as const,
};

/** Household objectives (newest deadline first), excluding archived ones. */
export function useObjectives() {
  return useQuery({
    queryKey: objectiveKeys.all,
    queryFn: async (): Promise<Objective[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("objectives")
        .select("*")
        .neq("status", "archived")
        .order("end_date", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
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
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .select("objective_id, status")
        .not("objective_id", "is", null);
      if (error) throw error;

      const counts = new Map<string, ObjectiveProgress>();
      for (const row of data) {
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
    mutationFn: async (
      input: Pick<TablesInsert<"objectives">, "title" | "period" | "start_date" | "end_date">,
    ) => {
      const supabase = createClient();
      // household_id / owner_id default to the caller's (DB default + RLS).
      const { data, error } = await supabase.from("objectives").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: objectiveKeys.all }),
  });
}

type ObjectivePatch = Pick<TablesUpdate<"objectives">, "title" | "status" | "sort_order">;

export function useUpdateObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ObjectivePatch }) => {
      const supabase = createClient();
      const { error } = await supabase.from("objectives").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: objectiveKeys.all }),
  });
}

export function useDeleteObjective() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("objectives").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: objectiveKeys.all });
      qc.invalidateQueries({ queryKey: objectiveKeys.progress });
      qc.invalidateQueries({ queryKey: ["tasks"] }); // linked tasks lose their objective_id
    },
  });
}
