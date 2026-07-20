import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHousehold, updateHouseholdName } from "@/lib/actions/households";
import type { Household } from "./types";

export const householdKeys = {
  current: ["household"] as const,
};

/** The signed-in user's shared space, scoped to their household in the session. */
export function useHousehold() {
  return useQuery({
    queryKey: householdKeys.current,
    queryFn: (): Promise<Household | null> => getHousehold(),
    staleTime: 5 * 60_000,
  });
}

/** Rename the shared space. Optimistic so the sidebar/label update instantly. */
export function useUpdateHouseholdName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => updateHouseholdName(name),
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
