import { useQuery } from "@tanstack/react-query";
import { getPartnerActiveTask } from "@/lib/actions/presence";
import type { Task } from "./types";

export const presenceKeys = {
  partner: ["presence", "partner"] as const,
};

/**
 * The partner's currently-active shared task (their timer is running), or null.
 * Polls every ~25s. `myId` gates the query until we know who "I" am.
 */
export function usePartnerPresence(myId: string | undefined) {
  return useQuery({
    queryKey: presenceKeys.partner,
    enabled: !!myId,
    refetchInterval: 25_000,
    queryFn: (): Promise<Task | null> => getPartnerActiveTask(),
  });
}
