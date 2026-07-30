"use client";

import { useMemo } from "react";
import { useProfiles } from "@/lib/queries/profiles";
import { useTaskTimeEntries } from "@/lib/queries/tasks";
import { compactDayLabel, todayISO } from "@/lib/date";
import { formatDuration } from "@/lib/format";
import { buildTimeBreakdown, type TimeBreakdown, type TimeSegment } from "@/lib/time-entries";
import { cn } from "@/lib/utils";
import type { Profile, Task } from "@/lib/queries/types";
import { OwnerAvatar } from "./owner-avatar";

/**
 * Day-by-day tracked time for one task.
 *
 * The point of this block: a task you carry over for three days shows a single
 * "Real: 4h", which hides whether that was one long day or three short ones.
 * Each row is one calendar day, the bar is relative to the heaviest day, and
 * the row for the day you're on ticks up live while the stopwatch runs.
 */
export function TaskTimeBreakdown({
  task,
  liveSegments,
  meId,
}: {
  task: Task;
  /** The run in progress, split by day — folded in so today ticks live. */
  liveSegments: TimeSegment[];
  meId?: string;
}) {
  const entriesQ = useTaskTimeEntries(task.id);
  const profiles = useProfiles().data ?? [];

  const breakdown = useMemo(() => {
    // The run in progress belongs to whoever is signed in on this device — the
    // stopwatch is local, so it can only ever be "my" time.
    const live = meId ? liveSegments.map((s) => ({ ...s, userId: meId })) : [];
    return buildTimeBreakdown(entriesQ.data ?? [], task.actual_time_min ?? 0, live);
  }, [entriesQ.data, task.actual_time_min, liveSegments, meId]);

  return (
    <TimeBreakdownList
      breakdown={breakdown}
      profiles={profiles}
      runningDays={liveSegments.map((s) => s.day)}
    />
  );
}

/**
 * The rows themselves — pure props, no data fetching.
 *
 * Renders nothing when there is nothing to break down (a single day with no
 * leftovers): the "Real" figure right above already says it, and repeating it
 * as a one-row chart would just be noise.
 */
export function TimeBreakdownList({
  breakdown,
  profiles,
  runningDays = [],
  today = todayISO(),
}: {
  breakdown: TimeBreakdown;
  profiles: Profile[];
  /** Days the stopwatch is currently accruing into — highlighted as live. */
  runningDays?: string[];
  today?: string;
}) {
  const { days, untrackedMin } = breakdown;
  const running = new Set(runningDays);
  const multiPerson = profiles.length > 1;

  const worthShowing = days.length >= 2 || (days.length >= 1 && untrackedMin > 0);
  if (!worthShowing) return null;

  // Bars are relative to the biggest row so the heaviest day always fills it.
  const scale = Math.max(breakdown.maxDayMin, untrackedMin, 1);
  const width = (min: number) => `${Math.max(4, (min / scale) * 100)}%`;
  const nameOf = (userId: string) => profiles.find((p) => p.id === userId)?.display_name ?? "?";

  return (
    <div className="mt-2 rounded-xl border border-border bg-surface px-3.5 py-3">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">Por día</span>
        <span className="text-2xs tabular-nums text-subtle">
          {days.length} {days.length === 1 ? "día" : "días"}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {days.map((d) => {
          const live = running.has(d.day);
          return (
            <li key={d.day} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "w-14 shrink-0 truncate text-xs sm:w-16",
                  d.day === today ? "font-semibold text-fg" : "text-muted",
                )}
              >
                {compactDayLabel(d.day, today)}
              </span>

              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-2">
                <span
                  style={{ width: width(d.minutes) }}
                  className={cn(
                    "block h-full rounded-pill transition-[width] duration-500",
                    live ? "animate-pulse bg-primary" : "bg-primary/55",
                  )}
                />
              </span>

              {multiPerson && (
                // Fixed width so the bars line up whether a day has one
                // contributor or two.
                <span className="flex w-8 shrink-0 justify-end -space-x-1">
                  {d.byUser.map((u) => (
                    <OwnerAvatar
                      key={u.userId}
                      profile={profiles.find((p) => p.id === u.userId)}
                      size={16}
                      title={`${nameOf(u.userId)}: ${formatDuration(u.minutes * 60)}`}
                    />
                  ))}
                </span>
              )}

              <span
                className={cn(
                  "w-14 shrink-0 text-right text-xs font-semibold tabular-nums sm:w-16",
                  live ? "text-primary" : "text-fg",
                )}
              >
                {formatDuration(d.minutes * 60)}
              </span>
            </li>
          );
        })}

        {untrackedMin > 0 && (
          <li
            className="flex items-center gap-2.5"
            title="Tiempo cargado a mano, o registrado antes de que se guardara el detalle por día"
          >
            <span className="w-14 shrink-0 truncate text-xs text-subtle sm:w-16">Sin fecha</span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-2">
              <span
                style={{ width: width(untrackedMin) }}
                className="block h-full rounded-pill bg-border"
              />
            </span>
            {multiPerson && <span className="w-8 shrink-0" aria-hidden />}
            <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-subtle sm:w-16">
              {formatDuration(untrackedMin * 60)}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
