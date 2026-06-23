import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Channel } from "./types";

export const channelKeys = {
  all: ["channels"] as const,
};

export const CHANNEL_COLORS = [
  "#0d9488",
  "#ea580c",
  "#7c3aed",
  "#db2777",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
];

/** Active channels in the household, ordered. */
export function useChannels() {
  return useQuery({
    queryKey: channelKeys.all,
    queryFn: async (): Promise<Channel[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("channels")
        .select("*")
        .is("archived_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color: string; icon?: string }) => {
      const supabase = createClient();
      // household_id defaults to the caller's household (DB default + RLS).
      const { data, error } = await supabase
        .from("channels")
        .insert({ name: input.name, color: input.color, icon: input.icon })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { name?: string; color?: string } }) => {
      const supabase = createClient();
      const { error } = await supabase.from("channels").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: channelKeys.all });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
