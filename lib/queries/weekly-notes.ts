import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getWeeklyNote as getWeeklyNoteAction,
  upsertWeeklyNote as upsertWeeklyNoteAction,
} from "@/lib/actions/weekly-notes";
import type { WeeklyNotePatch } from "@/lib/db/queries/weekly-notes";
import type { WeeklyNote } from "./types";

const noteKey = (weekStart: string) => ["weekly_note", weekStart] as const;

export function useWeeklyNote(weekStart: string) {
  return useQuery({
    queryKey: noteKey(weekStart),
    queryFn: (): Promise<WeeklyNote | null> => getWeeklyNoteAction(weekStart),
  });
}

export function useUpsertWeeklyNote(weekStart: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: WeeklyNotePatch): Promise<WeeklyNote> =>
      upsertWeeklyNoteAction(weekStart, patch),
    onSuccess: (data) => qc.setQueryData(noteKey(weekStart), data),
  });
}
