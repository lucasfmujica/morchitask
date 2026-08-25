"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, todayISO } from "@/lib/date";
import { useDateLabels } from "@/lib/use-date-labels";

const arrow =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

/**
 * The day's title block: what day it is, how it's going, and how to leave it.
 *
 * `meta` rides on the subtitle ("Jueves 20 de agosto · 5 de 13") instead of
 * getting its own line — the redesign's whole mobile header is 2 lines and a
 * pair of 44px buttons, so the score has to travel with the date.
 */
export function DateNavigator({
  date,
  meta,
  actions,
}: {
  date: string;
  /** Appended to the date line, e.g. "5 de 13". */
  meta?: string;
  /** Page-level actions, shown after the day arrows. */
  actions?: ReactNode;
}) {
  const labels = useDateLabels();
  const router = useRouter();
  const today = todayISO();
  const isToday = date === today;
  const go = (d: string) => router.push(d === today ? "/today" : `/day/${d}`);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold tracking-tight text-fg">
          {labels.relativeLabel(date, today)}
        </h1>
        <p className="truncate text-sm text-muted">
          {labels.fullDayLabel(date)}
          {meta && ` · ${meta}`}
        </p>
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
        {actions}
      </div>
    </div>
  );
}
