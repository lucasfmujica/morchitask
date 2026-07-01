import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Household } from "./types";

export const householdKeys = {
  current: ["household"] as const,
};

/**
 * The signed-in user's shared space. RLS scopes `households` to the current
 * household, so a plain select returns exactly one row.
 */
export function useHousehold() {
  return useQuery({
    queryKey: householdKeys.current,
    queryFn: async (): Promise<Household | null> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("households").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Rename the shared space. Optimistic so the sidebar/label update instantly. */
export function useUpdateHouseholdName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<void> => {
      const supabase = createClient();
      const { data: current } = await supabase.from("households").select("id").maybeSingle();
      if (!current) throw new Error("No se encontró tu espacio");
      const { error } = await supabase.from("households").update({ name }).eq("id", current.id);
      if (error) throw error;
    },
    onMutate: async (name) => {
      await qc.cancelQueries({ queryKey: householdKeys.current });
      const prev = qc.getQueryData<Household | null>(householdKeys.current);
      if (prev) qc.setQueryData<Household>(householdKeys.current, { ...prev, name });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(householdKeys.current, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: householdKeys.current });
    },
  });
}
