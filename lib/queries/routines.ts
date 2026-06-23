import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import type { RecurringTemplate } from "./types";

const routineKeys = { all: ["routines"] as const };

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

/** Generate this day's routine instances (idempotent server-side). */
export async function ensureDayMaterialized(date: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("ensure_day_materialized", { target_date: date });
  if (error) throw error;
}
