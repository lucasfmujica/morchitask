import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { addDays, todayISO, type DayISO } from "@/lib/date";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import type { RecurringTemplate } from "./types";

const routineKeys = {
  all: ["routines"] as const,
  streaks: ["routines", "streaks"] as const,
};

/** Completed routine-instance dates, keyed by `template_id`, for streaks. */
export type RoutineCompletions = Map<string, Set<DayISO>>;

export function useRoutines() {
  return useQuery({
    queryKey: routineKeys.all,
    queryFn: async (): Promise<RecurringTemplate[]> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let q = supabase.from("recurring_templates").select("*");
      if (user) q = q.eq("owner_id", user.id);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<"recurring_templates">) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("recurring_templates")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: routineKeys.all }),
  });
}

export function useUpdateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: TablesUpdate<"recurring_templates">;
    }) => {
      const supabase = createClient();
      const { error } = await supabase.from("recurring_templates").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: routineKeys.all }),
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("recurring_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: routineKeys.all }),
  });
}

/**
 * Completed instances of every routine over the last ~90 days, grouped by
 * `template_id`. One query (no N+1) — streaks are computed client-side from
 * this via `lib/streaks.ts`. RLS scopes rows to the current user's tasks.
 */
export function useRoutineStreaks() {
  return useQuery({
    queryKey: routineKeys.streaks,
    queryFn: async (): Promise<RoutineCompletions> => {
      const supabase = createClient();
      const since = addDays(todayISO(), -90);
      const { data, error } = await supabase
        .from("tasks")
        .select("template_id, template_date, status")
        .not("template_id", "is", null)
        .gte("template_date", since);
      if (error) throw error;

      const map: RoutineCompletions = new Map();
      for (const row of data ?? []) {
        if (row.status !== "done" || !row.template_id || !row.template_date) continue;
        let set = map.get(row.template_id);
        if (!set) {
          set = new Set();
          map.set(row.template_id, set);
        }
        set.add(row.template_date);
      }
      return map;
    },
  });
}

/** Generate this day's routine instances (idempotent server-side). */
export async function ensureDayMaterialized(date: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("ensure_day_materialized", { target_date: date });
  if (error) throw error;
}
