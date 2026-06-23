import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import type { DailyNote } from "./types";

const noteKey = (date: string) => ["daily_note", date] as const;

export function useDailyNote(date: string) {
  return useQuery({
    queryKey: noteKey(date),
    queryFn: async (): Promise<DailyNote | null> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("daily_notes")
        .select("*")
        .eq("owner_id", user.id)
        .eq("note_date", date)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

type NotePatch = Omit<TablesUpdate<"daily_notes">, "note_date" | "owner_id" | "id">;

export function useUpsertDailyNote(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: NotePatch): Promise<DailyNote> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      const { data, error } = await supabase
        .from("daily_notes")
        .upsert(
          { owner_id: user.id, note_date: date, ...patch },
          { onConflict: "owner_id,note_date" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => qc.setQueryData(noteKey(date), data),
  });
}

/** Move the caller's unfinished (non-routine) tasks between days. Returns count moved. */
export async function rolloverIncomplete(from: string, to: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("rollover_incomplete", {
    from_date: from,
    to_date: to,
  });
  if (error) throw error;
  return data ?? 0;
}
