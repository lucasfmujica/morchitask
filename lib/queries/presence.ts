import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "./types";

export const presenceKeys = {
  partner: ["presence", "partner"] as const,
};

/**
 * The partner's currently-active shared task (their timer is running), or null.
 * Polls every ~25s as a robust baseline and also subscribes to realtime task
 * changes so it updates instantly when realtime is available — it still works
 * without it. `myId` gates the query until we know who "I" am.
 */
export function usePartnerPresence(myId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: presenceKeys.partner,
    enabled: !!myId,
    refetchInterval: 25_000,
    queryFn: async (): Promise<Task | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("shared", true)
        .not("active_since", "is", null)
        .neq("owner_id", myId!)
        .order("active_since", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data[0] ?? null;
    },
  });

  useEffect(() => {
    if (!myId) return;
    const supabase = createClient();
    const channel = supabase
      .channel("presence-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: presenceKeys.partner });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [myId, qc]);

  return query;
}
