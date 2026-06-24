"use client";

import { useRouter } from "next/navigation";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, fullDayLabel, relativeLabel, todayISO } from "@/lib/date";

const arrow =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

export function DateNavigator({ date }: { date: string }) {
  const router = useRouter();
  const today = todayISO();
  const isToday = date === today;
  const go = (d: string) => router.push(d === today ? "/today" : `/day/${d}`);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold tracking-tight text-fg">
          {relativeLabel(date, today)}
        </h1>
        <p className="text-sm text-muted">{fullDayLabel(date)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button onClick={() => go(addDays(date, -1))} aria-label="Día anterior" className={arrow}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        {/* "Volver a hoy" — only when you're away from today (otherwise it just
            duplicates the title and reads like a label, which is confusing). */}
        {!isToday && (
          <button
            onClick={() => go(today)}
            title="Volver a hoy"
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary-soft px-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden />
            Hoy
          </button>
        )}
        <button onClick={() => go(addDays(date, 1))} aria-label="Día siguiente" className={arrow}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
