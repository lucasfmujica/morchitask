"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMonthCounts, type DayCount } from "@/lib/queries/tasks";
import { addMonths, monthGrid, monthLabel, monthOf, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const arrow =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

export function MonthView({ date }: { date: string }) {
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
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">{monthLabel(date)}</h1>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => router.push(`/month/${addMonths(date, -1)}`)}
            aria-label="Mes anterior"
            className={arrow}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            onClick={() => router.push(`/month/${today}`)}
            disabled={isThisMonth}
            className={cn(
              "h-9 cursor-pointer rounded-lg px-2.5 text-sm font-medium transition-colors",
              isThisMonth ? "cursor-default text-subtle" : "text-primary hover:bg-primary-soft",
            )}
          >
            Este mes
          </button>
          <button
            onClick={() => router.push(`/month/${addMonths(date, 1)}`)}
            aria-label="Mes siguiente"
            className={arrow}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="rounded-card border border-border bg-surface p-2 shadow-soft sm:p-3">
        <div className="mb-1 grid grid-cols-7">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-subtle"
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
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
                  "flex min-h-[58px] flex-col gap-1.5 rounded-lg p-1.5 transition-colors sm:min-h-[84px]",
                  !inMonth && "opacity-40",
                  inMonth && isWeekend && "bg-surface-2/50",
                  "hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-sm",
                    isToday
                      ? "bg-primary font-bold text-on-primary"
                      : inMonth
                        ? "font-medium text-fg"
                        : "text-subtle",
                  )}
                >
                  {dayNum}
                </span>
                <Dots entry={entry} />
              </Link>
            );
          })}
        </div>
      </div>

      <p className="text-center text-xs text-subtle">Tocá un día para planificarlo.</p>
    </div>
  );
}

function Dots({ entry }: { entry?: DayCount }) {
  if (!entry || entry.total === 0) return null;
  const pending = entry.total - entry.done;
  const allDone = pending === 0;
  const capped = Math.min(entry.total, 4);
  return (
    <span className="flex items-center gap-0.5" aria-label={`${entry.total} tareas`}>
      {Array.from({ length: capped }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            allDone ? "bg-success/60" : i < pending ? "bg-primary" : "bg-gray-300",
          )}
          aria-hidden
        />
      ))}
      {entry.total > 4 && (
        <span className="text-[10px] leading-none text-subtle">+{entry.total - 4}</span>
      )}
    </span>
  );
}
