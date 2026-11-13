"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  tasksInRangeQueryOptions,
  useWorkedInRange,
  type AnalyticsTask,
} from "@/lib/queries/tasks";
import { useChannelLookup, EMPTY_CHANNEL_MAP } from "@/lib/queries/channels";
import { useMe } from "@/lib/queries/profiles";
import type { Channel } from "@/lib/queries/types";
import { addMonths, monthGrid, monthOf, todayISO } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import { capacityState, resolveCapacity } from "@/lib/capacity";
import { canHaveWorked, resolveWorkGoal, workedState } from "@/lib/worked";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

// Prev / this month / next share one pill track, like every segmented control.
const arrow =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-pill text-fg transition-colors hover:bg-surface";

/** What one day of the grid carries: its plan and the tasks to name. */
type DaySummary = {
  total: number;
  plannedMin: number;
  /** Tasks to name in the cell, deadlines first (they get the highlighter). */
  chips: { key: string; title: string; color: string; deadline: boolean }[];
};

export function MonthView({ date }: { date: string }) {
  const labels = useDateLabels();
  const t = useTranslations("month");
  const tnav = useTranslations("nav");
  const tt = useTranslations("tasks");
  const router = useRouter();
  const today = todayISO();
  const weeks = monthGrid(date, 1);
  const targetMonth = monthOf(date);
  const isThisMonth = targetMonth === monthOf(today);

  const gridStart = weeks[0][0];
  const gridEnd = weeks[weeks.length - 1][6];
  // The range query (not the old counts-only one) because the cells now show
  // load against capacity, and that needs estimates and categories. It is the
  // same light row shape Resumen uses: no titles, no notes.
  const rows = useQuery(tasksInRangeQueryOptions(gridStart, gridEnd)).data;
  const channelsById = useChannelLookup().data ?? EMPTY_CHANNEL_MAP;
  const me = useMe().data;
  const capacity = resolveCapacity(null, me?.capacity_target_min);
  // The cell bars draw what I worked (tracked time, per day), not what was
  // planned; the plan only speaks for days that haven't happened yet.
  const worked = useWorkedInRange(gridStart, gridEnd).data;
  const workGoal = resolveWorkGoal();
  const noCategory = tt("noCategory");

  const byDay = useMemo(
    () => summarize(rows ?? [], me?.id, channelsById, noCategory),
    [rows, me?.id, channelsById, noCategory],
  );

  // The selected day drives the bar under the grid. It starts on today when
  // today is on screen, otherwise on the 1st, so the bar never points off-grid.
  const [selected, setSelected] = useState(() => (isThisMonth ? today : `${targetMonth}-01`));
  const sel = monthOf(selected) === targetMonth ? selected : `${targetMonth}-01`;
  const selSummary = byDay.get(sel);
  const selPlan = capacityState(selSummary?.plannedMin ?? 0, capacity);
  const selIsPast = sel < today;
  const selWorked = canHaveWorked(sel, today);

  return (
    <div className="flex w-full flex-col gap-4">
      <header
        className="flex animate-up flex-wrap items-center gap-2.5 px-2 pt-3"
        style={{ animationDelay: "60ms", animationDuration: "0.6s" }}
      >
        <div className="mr-auto flex min-w-0 flex-col gap-0.5">
          {/* The canvas sets every line here at the font's own `normal` height,
              not Tailwind's 1.5: with 1.5 the header, the weekday row and each
              chip line grew a few px apiece and the grid came out ~50px taller. */}
          <span className="text-[11px] leading-[normal] font-semibold tracking-[0.06em] text-muted uppercase">
            {tnav("month")}
          </span>
          {/* `!` because the global h1 rule (unlayered) otherwise beats the
              utility and halves the canvas's -0.02em to -0.01em. */}
          <h1 className="m-0 truncate font-display text-[32px] leading-[normal] font-semibold tracking-[-0.01em]!">
            {labels.monthLabel(date)}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-pill bg-surface-2 p-1">
          <button
            onClick={() => router.push(`/month/${addMonths(date, -1)}`)}
            aria-label={t("prevMonth")}
            className={arrow}
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          </button>
          <button
            onClick={() => router.push(`/month/${today}`)}
            disabled={isThisMonth}
            className={cn(
              "h-9 cursor-pointer rounded-pill px-3.5 text-sm font-semibold transition-colors",
              // On the current month it reads as the selected segment; elsewhere
              // it's the way back.
              isThisMonth
                ? "cursor-default bg-surface text-fg shadow-[0_1px_3px_rgb(var(--shadow-color)/0.12)]"
                : "text-fg hover:bg-surface",
            )}
          >
            {t("thisMonth")}
          </button>
          <button
            onClick={() => router.push(`/month/${addMonths(date, 1)}`)}
            aria-label={t("nextMonth")}
            className={arrow}
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
          </button>
        </div>
      </header>

      {/* The month is a well; each day is a white cell on it. */}
      <section
        className="animate-up rounded-2xl bg-surface-2 p-1.5 sm:rounded-[28px] sm:p-2.5"
        style={{ animationDelay: "120ms", animationDuration: "0.6s" }}
      >
        <div className="grid grid-cols-7 gap-1 px-1 pt-1.5 pb-2.5 sm:gap-2">
          {labels.weekdayHeaders().map((w) => (
            <div
              key={w}
              className="text-center text-[11px] leading-[normal] font-semibold tracking-[0.06em] text-muted uppercase sm:pl-2.5 sm:text-left"
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {weeks.flat().map((d) => {
            // Days outside the month are empty outlines, not cards: the grid
            // keeps its shape without competing with the real month.
            if (monthOf(d) !== targetMonth) {
              return (
                <div
                  key={d}
                  aria-hidden
                  className="min-h-[64px] rounded-lg opacity-60 shadow-[inset_0_0_0_1.5px_var(--color-border)] sm:min-h-[112px] sm:rounded-[18px]"
                />
              );
            }
            return (
              <DayCell
                key={d}
                day={d}
                label={t("cellLabel", {
                  day: labels.fullDayLabel(d),
                  n: byDay.get(d)?.total ?? 0,
                })}
                isToday={d === today}
                isPast={d < today}
                selected={d === sel}
                summary={byDay.get(d)}
                workedMin={canHaveWorked(d, today) ? (worked?.get(d) ?? 0) : 0}
                goalMin={workGoal}
                onSelect={() => setSelected(d)}
              />
            );
          })}
        </div>
      </section>

      {/* The selected day, in words, with the way into it. Planning is the
          main move; past days can only be looked at, so they get "open". */}
      <div
        aria-live="polite"
        className="flex animate-up flex-wrap items-center gap-3 rounded-2xl bg-surface py-2 pr-2 pl-5 shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06)] sm:rounded-pill"
        style={{ animationDelay: "220ms", animationDuration: "0.6s" }}
      >
        <span className="mr-auto text-sm font-semibold text-fg">{labels.fullDayLabel(sel)}</span>
        <span className="text-xs text-muted tabular-nums">
          {selWorked
            ? t("workedDay", {
                worked: formatMinutes(worked?.get(sel) ?? 0),
                goal: formatMinutes(workGoal),
              })
            : !selSummary || selSummary.plannedMin === 0
              ? t("noLoad")
              : selPlan.over
                ? t("plannedDayOver", {
                    planned: formatMinutes(selSummary.plannedMin),
                    over: formatMinutes(selPlan.overByMin),
                  })
                : t("plannedDay", { planned: formatMinutes(selSummary.plannedMin) })}
        </span>
        <div className="flex items-center gap-1">
          {!selIsPast && (
            <Link
              href={sel === today ? "/today" : `/day/${sel}`}
              className={cn(buttonVariants({ variant: "ghost", size: "md" }), "px-[18px]")}
            >
              {t("openDay")}
            </Link>
          )}
          <Link
            href={selIsPast ? `/day/${sel}` : `/plan/${sel}`}
            className={cn(buttonVariants({ size: "md" }), "px-[18px]")}
          >
            {selIsPast ? t("openDay") : t("planThatDay")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function DayCell({
  day,
  label,
  isToday,
  isPast,
  selected,
  summary,
  workedMin,
  goalMin,
  onSelect,
}: {
  day: string;
  label: string;
  isToday: boolean;
  isPast: boolean;
  selected: boolean;
  summary?: DaySummary;
  /** 0 for future days: nothing can have been worked yet. */
  workedMin: number;
  goalMin: number;
  onSelect: () => void;
}) {
  const t = useTranslations("month");
  const chips = summary?.chips.slice(0, 2) ?? [];
  const extra = (summary?.chips.length ?? 0) - chips.length;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "flex min-h-[64px] min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-lg bg-surface p-1 text-left text-fg transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none sm:min-h-[112px] sm:items-stretch sm:rounded-[18px] sm:p-2.5",
        selected
          ? "shadow-[inset_0_0_0_2px_var(--color-fg)]"
          : "shadow-[0_1px_2px_rgb(var(--shadow-color)/0.06)] hover:shadow-[0_6px_16px_rgb(var(--shadow-color)/0.08)]",
        // Past days fade so the eye lands on what's still ahead, selected or not.
        isPast && "opacity-60",
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-pill font-sans text-sm font-semibold tabular-nums sm:h-7 sm:w-7",
          // White on the mint gradient: the canvas draws it so and the user
          // asked for it as drawn, even though the light end of the ramp
          // gives small text less contrast than solid primary did.
          isToday ? "bg-fit text-on-primary" : "text-fg",
        )}
      >
        {Number(day.slice(8, 10))}
      </span>

      {/* Category chips only where there's room for a word; on a phone the
          load bar alone says how full the day is. */}
      {chips.map((c) => (
        <span
          key={c.key}
          className={cn(
            "hidden min-w-0 items-center gap-[5px] text-[11px] leading-[normal] font-semibold sm:flex",
            // A deadline that day wears the highlighter, as everywhere else.
            c.deadline ? "-rotate-1 rounded-[4px] bg-marker px-1 py-px text-on-marker" : "text-fg",
          )}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
            style={{ background: c.color }}
            aria-hidden
          />
          <span className="truncate">{c.title}</span>
        </span>
      ))}
      {extra > 0 && (
        <span className="hidden text-[11px] leading-[normal] text-muted sm:block">
          {t("moreCategories", { n: extra })}
        </span>
      )}

      <WorkedBar workedMin={workedMin} goalMin={goalMin} />
    </button>
  );
}

/**
 * The thin bar at the foot of each cell: how much of the day's work goal I put
 * in. It used to draw planned load against capacity, with a hatched overrun;
 * worked time past the goal is not an overload, so it just fills.
 */
function WorkedBar({ workedMin, goalMin }: { workedMin: number; goalMin: number }) {
  const { pct } = workedState(workedMin, goalMin);
  return (
    <span
      className="mt-auto block h-1 w-full shrink-0 overflow-hidden rounded-pill bg-surface-2"
      aria-hidden
    >
      {/* The canvas runs this gradient at 90deg (bg-fit is 135deg), which on
          a 4px bar is what keeps the dark end visible at the right. */}
      <span
        className="block h-full animate-fill rounded-pill transition-[width] duration-300"
        style={{
          width: `${pct}%`,
          animationDuration: "1s",
          animationDelay: "0.5s",
          background: "linear-gradient(90deg, var(--fit-from), var(--primary))",
        }}
      />
    </span>
  );
}

/**
 * Rows → one summary per day. Planned time counts only the viewer's own tasks
 * (capacity is personal); the task count keeps shared ones, as the old dots
 * did. Chips name the tasks, with that day's deadlines first.
 */
function summarize(
  rows: readonly AnalyticsTask[],
  meId: string | undefined,
  channelsById: Map<string, Channel>,
  noCategoryName: string,
): Map<string, DaySummary> {
  const out = new Map<string, DaySummary>();
  for (const r of rows) {
    if (!r.planned_date) continue;
    const s = out.get(r.planned_date) ?? { total: 0, plannedMin: 0, chips: [] };
    s.total += 1;
    if (!meId || r.owner_id === meId) s.plannedMin += r.time_estimate_min ?? 0;
    const channel = r.channel_id ? channelsById.get(r.channel_id) : undefined;
    s.chips.push({
      key: r.id ?? `${r.planned_date}-${s.total}`,
      // Older cached rows (or a stale server) may lack the title; fall back to
      // the category so the cell never shows an empty chip.
      title: r.title ?? channel?.name ?? noCategoryName,
      color: channel?.color ?? "var(--color-border-strong)",
      deadline: r.due_date === r.planned_date,
    });
    out.set(r.planned_date, s);
  }
  for (const s of out.values()) s.chips.sort((a, b) => Number(b.deadline) - Number(a.deadline));
  return out;
}
