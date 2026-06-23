"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMonthCounts } from "@/lib/queries/tasks";
import { addMonths, monthGrid, monthLabel, monthOf, todayISO, weekRange } from "@/lib/date";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const navBtn =
  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

/**
 * Compact month picker for the Week view's left rail. Highlights the active
 * week (the one currently shown in the columns) and today, and clicking any
 * day navigates the week strip to that week. The displayed month is its own
 * state so the user can page months without changing the viewed week.
 */
export function WeekCalendarRail({ date }: { date: string }) {
  const router = useRouter();
  const today = todayISO();

  // Month shown in the picker — independent of the viewed week, but follows it
  // when the active week crosses into a different month.
  const [cursor, setCursor] = useState(date);
  useEffect(() => {
    setCursor(date);
  }, [date]);

  const weeks = monthGrid(cursor, 1);
  const cursorMonth = monthOf(cursor);
  const weekSet = new Set(weekRange(date, 1));

  const gridStart = weeks[0][0];
  const gridEnd = weeks[weeks.length - 1][6];
  const counts = useMonthCounts(gridStart, gridEnd).data;

  return (
    <div className="rounded-card border border-border bg-surface p-3 shadow-soft">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold tracking-tight text-fg">{monthLabel(cursor)}</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCursor(addMonths(cursor, -1))}
            aria-label="Mes anterior"
            className={navBtn}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            onClick={() => setCursor(addMonths(cursor, 1))}
            aria-label="Mes siguiente"
            className={navBtn}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="py-1 text-center text-[11px] font-semibold text-subtle">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {weeks.flat().map((d, idx) => {
          const inMonth = monthOf(d) === cursorMonth;
          const isToday = d === today;
          const inWeek = weekSet.has(d);
          const col = idx % 7;
          const hasTasks = (counts?.get(d)?.total ?? 0) > 0;
          const dayNum = Number(d.slice(8, 10));
          return (
            <button
              key={d}
              onClick={() => router.push(`/week/${d}`)}
              aria-label={`Semana del ${d}`}
              aria-current={inWeek ? "date" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 py-0.5 transition-colors",
                inWeek && "bg-primary-soft",
                inWeek && col === 0 && "rounded-l-lg",
                inWeek && col === 6 && "rounded-r-lg",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[13px] transition-colors",
                  isToday
                    ? "bg-primary font-bold text-on-primary"
                    : inWeek
                      ? "font-semibold text-primary"
                      : inMonth
                        ? "font-medium text-fg hover:bg-surface-2"
                        : "text-subtle hover:bg-surface-2",
                )}
              >
                {dayNum}
              </span>
              <span
                className={cn(
                  "h-1 w-1 rounded-full",
                  hasTasks ? (isToday ? "bg-primary" : "bg-subtle") : "bg-transparent",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
