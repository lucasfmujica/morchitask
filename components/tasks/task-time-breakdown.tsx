"use client";

import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { useProfiles } from "@/lib/queries/profiles";
import { useSetTaskDayTime, useTaskTimeEntries } from "@/lib/queries/tasks";
import { addDays, compactDayLabel, todayISO } from "@/lib/date";
import { formatDuration, parseDuration } from "@/lib/format";
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
 *
 * Rows are editable because the stopwatch is not the only way time happens:
 * you forget to start it, or you work away from the app. Fixing "Real" alone
 * can only land in "Sin fecha" — the day has to be sayable too.
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
  const setDay = useSetTaskDayTime(task.id, task.planned_date);

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
      meId={meId}
      onSetDay={meId ? (day, minutes) => setDay.mutate({ day, minutes, userId: meId }) : undefined}
    />
  );
}

/**
 * The rows themselves — pure props, no data fetching.
 *
 * Renders nothing only when no day has been tracked and there is nothing to
 * assign — with tracked time there is always something to say, even on day one
 * ("this all happened today"), and that is what makes the block findable.
 */
export function TimeBreakdownList({
  breakdown,
  profiles,
  runningDays = [],
  today = todayISO(),
  meId,
  onSetDay,
}: {
  breakdown: TimeBreakdown;
  profiles: Profile[];
  /** Days the stopwatch is currently accruing into — highlighted as live. */
  runningDays?: string[];
  today?: string;
  /** Whose time the edits belong to; without it the block is read-only. */
  meId?: string;
  /** Set (not add) my minutes on `day`. */
  onSetDay?: (day: string, minutes: number) => void;
}) {
  const { days, untrackedMin } = breakdown;
  const running = new Set(runningDays);
  const multiPerson = profiles.length > 1;
  const editable = !!onSetDay && !!meId;

  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Under a minute the remainder is rounding noise from the stopwatch, not
  // something the user actually did — a "Sin fecha: 0m" row would just confuse.
  const showUntracked = untrackedMin >= 1;

  // Nothing tracked and nothing to assign: the "Real" figure above says it all.
  if (days.length === 0 && !(editable && showUntracked)) return null;

  // Bars are relative to the biggest row so the heaviest day always fills it.
  const scale = Math.max(breakdown.maxDayMin, showUntracked ? untrackedMin : 0, 1);
  const width = (min: number) => `${Math.max(4, (min / scale) * 100)}%`;
  const nameOf = (userId: string) => profiles.find((p) => p.id === userId)?.display_name ?? "?";
  const myMinutes = (day: string) =>
    days.find((d) => d.day === day)?.byUser.find((u) => u.userId === meId)?.minutes ?? 0;

  function commit(day: string, raw: string) {
    setEditingDay(null);
    setAdding(false);
    // An empty box means "none" — parseDuration returns null, which clears the day.
    onSetDay?.(day, parseDuration(raw) ?? 0);
  }

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
          const others = d.minutes - myMinutes(d.day);

          if (editingDay === d.day) {
            return (
              <li key={d.day} className="flex items-center gap-2.5">
                <span className="w-14 shrink-0 truncate text-xs font-semibold text-fg sm:w-16">
                  {compactDayLabel(d.day, today)}
                </span>
                <DurationInput
                  initial={myMinutes(d.day)}
                  onCommit={(raw) => commit(d.day, raw)}
                  onCancel={() => setEditingDay(null)}
                />
                {others > 0 && (
                  // Editing only ever touches my own share, so say out loud
                  // what the row's number also contains.
                  <span className="shrink-0 text-2xs text-subtle">
                    + {formatDuration(others * 60)} de{" "}
                    {nameOf(d.byUser.find((u) => u.userId !== meId)?.userId ?? "")}
                  </span>
                )}
              </li>
            );
          }

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

              {/* While the stopwatch is on this day the number is moving —
                  editing it would fight the live count, so it waits. */}
              {editable && !live ? (
                <button
                  onClick={() => setEditingDay(d.day)}
                  title="Corregir tu tiempo de este día"
                  className="w-14 shrink-0 cursor-pointer text-right text-xs font-semibold tabular-nums text-fg underline decoration-dotted decoration-from-font underline-offset-4 transition-colors hover:text-primary sm:w-16"
                >
                  {formatDuration(d.minutes * 60)}
                </button>
              ) : (
                <span
                  className={cn(
                    "w-14 shrink-0 text-right text-xs font-semibold tabular-nums sm:w-16",
                    live ? "text-primary" : "text-fg",
                  )}
                >
                  {formatDuration(d.minutes * 60)}
                </span>
              )}
            </li>
          );
        })}

        {showUntracked && (
          <li
            className="flex items-center gap-2.5"
            title={
              editable
                ? "Tiempo sin día: cargalo en un día con «Otro día» y sale de acá"
                : "Tiempo cargado a mano, o registrado antes de que se guardara el detalle por día"
            }
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

        {adding && (
          <AddDayRow
            today={today}
            takenDays={days.map((d) => d.day)}
            onCommit={commit}
            onCancel={() => setAdding(false)}
          />
        )}
      </ul>

      {editable && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="mt-2.5 inline-flex cursor-pointer items-center gap-1 text-2xs font-semibold text-subtle transition-colors hover:text-primary"
        >
          <Plus className="h-3 w-3" aria-hidden /> Otro día
        </button>
      )}
    </div>
  );
}

/** Duration box that saves on Enter/blur and backs out on Escape. */
function DurationInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: number;
  onCommit: (raw: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial > 0 ? formatDuration(initial * 60) : "");
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          // Blur would commit on the way out, so drop the value first.
          setValue(initial > 0 ? formatDuration(initial * 60) : "");
          onCancel();
        }
      }}
      placeholder="ej. 1h 30m"
      aria-label="Tiempo de este día"
      className="min-w-0 flex-1 border-b border-primary bg-transparent text-xs font-semibold tabular-nums text-fg outline-none placeholder:font-normal placeholder:text-subtle"
    />
  );
}

/**
 * Add a day that has no row yet — the case the stopwatch can't cover: you
 * worked yesterday and forgot to start it, so no row exists to click.
 */
function AddDayRow({
  today,
  takenDays,
  onCommit,
  onCancel,
}: {
  today: string;
  takenDays: string[];
  onCommit: (day: string, raw: string) => void;
  onCancel: () => void;
}) {
  const yesterday = addDays(today, -1);
  // Default to whichever of today/yesterday you haven't logged yet: adding a
  // day you already have is the one thing this row isn't for.
  const [day, setDay] = useState(!takenDays.includes(yesterday) ? yesterday : today);
  const [value, setValue] = useState("");

  return (
    <li className="flex items-center gap-2 border-t border-border pt-2">
      <input
        type="date"
        value={day}
        max={today}
        onChange={(e) => e.target.value && setDay(e.target.value)}
        aria-label="Día"
        className="w-[7.5rem] shrink-0 rounded-md border border-border bg-surface-2 px-1.5 py-1 text-xs tabular-nums text-fg outline-none focus:border-primary"
      />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onCommit(day, value);
          if (e.key === "Escape") onCancel();
        }}
        placeholder="ej. 1h 30m"
        aria-label="Cuánto tiempo"
        className="min-w-0 flex-1 border-b border-primary bg-transparent text-xs font-semibold tabular-nums text-fg outline-none placeholder:font-normal placeholder:text-subtle"
      />
      <button
        onClick={() => value.trim() && onCommit(day, value)}
        disabled={!value.trim()}
        aria-label="Guardar"
        className="shrink-0 cursor-pointer rounded-md p-1 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:text-subtle disabled:hover:bg-transparent"
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        onClick={onCancel}
        aria-label="Cancelar"
        className="shrink-0 cursor-pointer rounded-md p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </li>
  );
}
