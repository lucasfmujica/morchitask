"use client";

import { useQuery } from "@tanstack/react-query";
import { countOverdue } from "@/lib/actions/carryover";

export const carryoverKeys = {
  overdue: (today: string) => ["carryover", "overdue", today] as const,
};

/**
 * How much unfinished work is sitting on days before `today`.
 *
 * Replaces counting yesterday's tasks and calling that "what's pending": on a
 * Monday yesterday is an empty Sunday, so the old count was zero while three
 * days of work waited out of sight.
 */
export function useOverdueCount(today: string) {
  return useQuery({
    queryKey: carryoverKeys.overdue(today),
    queryFn: () => countOverdue(today),
  });
}
