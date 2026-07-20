import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDailyNote as getDailyNoteAction,
  rolloverIncomplete as rolloverIncompleteAction,
  upsertDailyNote as upsertDailyNoteAction,
} from "@/lib/actions/daily-notes";
import type { DailyNotePatch as NotePatch } from "@/lib/db/queries/daily-notes";
import type { DailyNote } from "./types";

const noteKey = (date: string) => ["daily_note", date] as const;

export function useDailyNote(date: string) {
  return useQuery({
    queryKey: noteKey(date),
    queryFn: (): Promise<DailyNote | null> => getDailyNoteAction(date),
  });
}

export function useUpsertDailyNote(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: NotePatch): Promise<DailyNote> => upsertDailyNoteAction(date, patch),
    onSuccess: (data) => qc.setQueryData(noteKey(date), data),
  });
}

/** Move the caller's unfinished (non-routine) tasks between days. Returns count moved. */
export async function rolloverIncomplete(from: string, to: string): Promise<number> {
  return rolloverIncompleteAction(from, to);
}
