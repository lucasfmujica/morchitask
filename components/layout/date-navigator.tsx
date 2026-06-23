"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, fullDayLabel, relativeLabel, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

const arrow =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

export function DateNavigator({ date }: { date: string }) {
  const router = useRouter();
  const today = todayISO();
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
        <button
          onClick={() => go(today)}
          disabled={date === today}
          className={cn(
            "h-9 cursor-pointer rounded-lg px-3 text-sm font-medium transition-colors",
            date === today ? "cursor-default text-subtle" : "text-primary hover:bg-primary-soft",
          )}
        >
          Hoy
        </button>
        <button onClick={() => go(addDays(date, 1))} aria-label="Día siguiente" className={arrow}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
