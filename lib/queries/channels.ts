import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Channel } from "./types";

export const channelKeys = {
  all: ["channels"] as const,
  household: ["channels", "household"] as const,
};

async function currentUserId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// Ordered as a soft rainbow so the picker reads naturally. Includes celeste
// (sky), amarillo (yellow) and more hues so each category can feel distinct.
export const CHANNEL_COLORS = [
  "#0d9488", // verde azulado (teal)
  "#06b6d4", // cian
  "#0ea5e9", // celeste
  "#2563eb", // azul
  "#6366f1", // índigo
  "#7c3aed", // violeta
  "#c026d3", // fucsia
  "#db2777", // rosa
  "#e11d48", // frambuesa
  "#dc2626", // rojo
  "#ea580c", // naranja
  "#d97706", // ámbar
  "#eab308", // amarillo
  "#84cc16", // lima
  "#16a34a", // verde
  "#059669", // esmeralda
];

/**
 * My own active categories, ordered. These are what the picker/manager show:
 * categories are now per-user, so you only see (and can edit/delete) your own.
 */
export function useChannels() {
  return useQuery({
    queryKey: channelKeys.all,
    queryFn: async (): Promise<Channel[]> => {
      const supabase = createClient();
      const uid = await currentUserId();
      // If we don't know who's signed in yet, show nothing rather than widening
      // to every household member's categories — that briefly leaked a partner's
      // categories (e.g. Sofi's "Medicos") into the picker during auth load.
      if (!uid) return [];
      const { data, error } = await supabase
        .from("channels")
        .select("*")
        .is("archived_at", null)
        .eq("owner_id", uid)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Stable empty map for the loading state, so callers don't re-create one. */
export const EMPTY_CHANNEL_MAP: Map<string, Channel> = new Map();

/**
 * Every household member's active categories as an id → Channel map. Used only
 * to render the category chip on tasks (including a partner's shared task, whose
 * category belongs to them) — never for the picker, which stays personal.
 */
export function useChannelLookup() {
  return useQuery({
    queryKey: channelKeys.household,
    queryFn: async (): Promise<Map<string, Channel>> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("channels").select("*").is("archived_at", null);
      if (error) throw error;
      return new Map(data.map((c) => [c.id, c]));
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
