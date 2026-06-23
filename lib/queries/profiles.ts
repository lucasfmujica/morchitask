import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "./types";

export const profileKeys = {
  all: ["profiles"] as const,
  me: ["me"] as const,
};

/** All profiles in the household (for owner attribution: Lucas + Sofi). */
export function useProfiles() {
  return useQuery({
    queryKey: profileKeys.all,
    queryFn: async (): Promise<Profile[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** The current signed-in user's profile. */
export function useMe() {
  return useQuery({
    queryKey: profileKeys.me,
    queryFn: async (): Promise<Profile | null> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      display_name?: string;
      color?: string;
      capacity_target_min?: number | null;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.me });
      qc.invalidateQueries({ queryKey: profileKeys.all });
    },
  });
}
