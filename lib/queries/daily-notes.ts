import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDailyNote as getDailyNoteAction,
  getShutdownDays as getShutdownDaysAction,
  rolloverIncomplete as rolloverIncompleteAction,
  upsertDailyNote as upsertDailyNoteAction,
} from "@/lib/actions/daily-notes";
import { addDays } from "@/lib/date";
import { currentStreak } from "@/lib/streaks";
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

/** How many days in a row you've closed the day, counting back from `today`.
 *  Today gets grace: not having closed it yet doesn't break the streak. */
export function useShutdownStreak(today: string) {
  const from = addDays(today, -STREAK_WINDOW_DAYS);
  const q = useQuery({
    queryKey: ["daily_note", "shutdown_days", from, today] as const,
    queryFn: (): Promise<string[]> => getShutdownDaysAction(from, today),
    staleTime: 60_000,
  });
  const days = useMemo(() => new Set(q.data ?? []), [q.data]);
  // A shutdown is expected every day, which is exactly what freq "daily" means
  // to `currentStreak` — no separate streak implementation needed.
  return currentStreak("daily", null, days, today, STREAK_WINDOW_DAYS);
}

/** Long enough for any streak worth showing; short enough to stay one cheap query. */
const STREAK_WINDOW_DAYS = 120;
