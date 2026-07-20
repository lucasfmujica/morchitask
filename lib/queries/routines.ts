import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRoutine as createRoutineAction,
  deleteRoutine as deleteRoutineAction,
  ensureDayMaterialized as ensureDayMaterializedAction,
  getMyRoutines,
  getRoutineStreaks,
  updateRoutine as updateRoutineAction,
} from "@/lib/actions/routines";
import type { RoutineInput } from "@/lib/db/queries/routines";
import { addDays, todayISO, type DayISO } from "@/lib/date";
import type { RecurringTemplate } from "./types";

const routineKeys = {
  all: ["routines"] as const,
  streaks: ["routines", "streaks"] as const,
};

/** Completed routine-instance dates, keyed by `template_id`, for streaks. */
export type RoutineCompletions = Map<string, Set<DayISO>>;

export function useRoutines() {
  return useQuery({
    queryKey: routineKeys.all,
    queryFn: (): Promise<RecurringTemplate[]> => getMyRoutines(),
  });
}

export function useCreateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RoutineInput) => createRoutineAction(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: routineKeys.all }),
  });
}

export function useUpdateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RoutineInput> }) =>
      updateRoutineAction(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: routineKeys.all }),
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRoutineAction(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: routineKeys.all }),
  });
}

/**
 * Completed instances of every routine over the last ~90 days, grouped by
 * `template_id`. One query (no N+1) — streaks are computed client-side from
 * this via `lib/streaks.ts`.
 */
export function useRoutineStreaks() {
  return useQuery({
    queryKey: routineKeys.streaks,
    queryFn: async (): Promise<RoutineCompletions> => {
      const since = addDays(todayISO(), -90);
      const rows = await getRoutineStreaks(since);

      const map: RoutineCompletions = new Map();
      for (const row of rows) {
        if (row.status !== "done" || !row.template_id || !row.template_date) continue;
        let set = map.get(row.template_id);
        if (!set) {
          set = new Set();
          map.set(row.template_id, set);
        }
        set.add(row.template_date);
      }
      return map;
    },
  });
}

/** Generate this day's routine instances (idempotent server-side). */
export async function ensureDayMaterialized(date: string) {
  await ensureDayMaterializedAction(date);
}
