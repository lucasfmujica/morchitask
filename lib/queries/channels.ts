import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createChannel as createChannelAction,
  deleteChannel as deleteChannelAction,
  getHouseholdChannels,
  getMyChannels,
  reorderChannels as reorderChannelsAction,
  updateChannel as updateChannelAction,
} from "@/lib/actions/channels";
import type { Channel } from "./types";

export const channelKeys = {
  all: ["channels"] as const,
  household: ["channels", "household"] as const,
};

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
    queryFn: (): Promise<Channel[]> => getMyChannels(),
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
      const data = await getHouseholdChannels();
      return new Map(data.map((c) => [c.id, c]));
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color: string; icon?: string }) =>
      createChannelAction(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; color?: string } }) =>
      updateChannelAction(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

/**
 * Persist a new category order after a drag. Takes the full ordered list of ids
 * and renumbers them to evenly spaced values (1000, 2000, …). Renumbering the
 * whole (short) list — rather than writing one fractional value — keeps ordering
 * well-defined even when older rows shared a sort_order. Optimistic so the
 * sidebar reorders instantly.
 */
export function useReorderChannels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderChannelsAction(orderedIds),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: channelKeys.all });
      const prev = qc.getQueryData<Channel[]>(channelKeys.all);
      qc.setQueryData<Channel[]>(channelKeys.all, (old = []) => {
        const byId = new Map(old.map((c) => [c.id, c]));
        return orderedIds
          .map((id, i) => {
            const c = byId.get(id);
            return c ? { ...c, sort_order: (i + 1) * 1000 } : null;
          })
          .filter((c): c is Channel => c !== null);
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(channelKeys.all, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: channelKeys.all }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteChannelAction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: channelKeys.all });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
