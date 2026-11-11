"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMonthCounts, type DayCount } from "@/lib/queries/tasks";
import { addMonths, monthGrid, monthOf, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

// Prev / this month / next share one pill track, like every segmented control.
const arrow =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-pill text-fg transition-colors hover:bg-surface";

export function MonthView({ date }: { date: string }) {
  const labels = useDateLabels();
  const t = useTranslations("month");
  const router = useRouter();
  const today = todayISO();
  const weeks = monthGrid(date, 1);
  const targetMonth = monthOf(date);
  const isThisMonth = targetMonth === monthOf(today);

  const gridStart = weeks[0][0];
  const gridEnd = weeks[weeks.length - 1][6];
  const counts = useMonthCounts(gridStart, gridEnd).data;

  return (
    <div className="flex max-w-3xl flex-col gap-4 lg:max-w-4xl">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-fg md:text-3xl">
          {labels.monthLabel(date)}
        </h1>
        <div className="flex shrink-0 items-center gap-0.5 rounded-pill bg-surface-2 p-1">
          <button
            onClick={() => router.push(`/month/${addMonths(date, -1)}`)}
            aria-label={t("prevMonth")}
            className={arrow}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            onClick={() => router.push(`/month/${today}`)}
            disabled={isThisMonth}
            className={cn(
              "h-9 cursor-pointer rounded-pill px-3 text-sm font-semibold transition-colors",
              // On the current month it reads as the selected segment; elsewhere
              // it's the way back.
              isThisMonth
                ? "cursor-default bg-surface text-fg shadow-soft"
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
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      {/* The month is a well; each day is a white cell on it. */}
      <div className="rounded-2xl bg-surface-2 p-1.5 sm:p-2.5">
        <div className="mb-1 grid grid-cols-7 gap-1 sm:gap-2">
          {labels.weekdayHeaders().map((w) => (
            <div
              key={w}
              className="py-1 text-center text-2xs font-semibold tracking-wide text-muted uppercase sm:pl-2.5 sm:text-left"
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {weeks.flat().map((d, idx) => {
            const inMonth = monthOf(d) === targetMonth;
            const isToday = d === today;
            const isWeekend = idx % 7 >= 5;
            const entry = counts?.get(d);
            const dayNum = Number(d.slice(8, 10));
            return (
              <Link
                key={d}
                href={isToday ? "/today" : `/day/${d}`}
                className={cn(
                  "flex min-h-[64px] flex-col items-center gap-1.5 rounded-lg p-1 transition-[box-shadow,transform] duration-200 sm:min-h-[96px] sm:items-start sm:rounded-xl sm:p-2",
                  // Days outside the month are outlines, not cards: the grid
                  // keeps its shape without competing with the real month.
                  inMonth
                    ? "bg-surface shadow-soft hover:-translate-y-px hover:shadow-card"
                    : "opacity-60 ring-1 ring-border ring-inset hover:bg-surface/50",
                  inMonth && isWeekend && "bg-surface/80",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-pill font-display text-sm tabular-nums sm:h-7 sm:w-7",
                    isToday
                      ? "bg-primary font-bold text-on-primary shadow-soft"
                      : inMonth
                        ? "font-semibold text-fg"
                        : "text-subtle",
                  )}
                >
                  {dayNum}
                </span>
                <Dots entry={entry} />
                <DoneBar entry={entry} />
              </Link>
            );
          })}
        </div>
      </div>

      <p className="text-center text-xs text-subtle">{t("tapDayHint")}</p>
    </div>
  );
}

function Dots({ entry }: { entry?: DayCount }) {
  const t = useTranslations("month");
  if (!entry || entry.total === 0) return null;
  const pending = entry.total - entry.done;
  const allDone = pending === 0;
  const capped = Math.min(entry.total, 4);
  return (
    <span className="flex items-center gap-0.5" aria-label={t("taskCount", { n: entry.total })}>
      {Array.from({ length: capped }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            allDone ? "bg-success/60" : i < pending ? "bg-primary" : "bg-border-strong",
          )}
          aria-hidden
        />
      ))}
      {entry.total > 4 && (
        <span className="text-2xs leading-none text-subtle">+{entry.total - 4}</span>
      )}
    </span>
  );
}

/**
 * The thin bar at the foot of each cell. The month only fetches counts (not
 * minutes), so it fills with how much of the day got done rather than how
 * loaded it was — green, because done is what green means.
 */
function DoneBar({ entry }: { entry?: DayCount }) {
  if (!entry || entry.total === 0) return null;
  return (
    <span
      className="mt-auto block h-1 w-full overflow-hidden rounded-pill bg-surface-2"
      aria-hidden
    >
      <span
        className="block h-full rounded-pill bg-fit transition-[width] duration-300"
        style={{ width: `${(entry.done / entry.total) * 100}%` }}
      />
    </span>
  );
}
