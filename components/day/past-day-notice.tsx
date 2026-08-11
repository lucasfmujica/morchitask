"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { fullDayLabel, todayISO } from "@/lib/date";

/**
 * A loud "this isn't today" strip for the day, plan and shutdown screens.
 *
 * The arrows and the small "Hoy" chip in the header were too quiet: it's easy
 * to spend a whole workday parked on an old day, adding tasks that land on a
 * date "Hoy" never shows — which reads exactly like your tasks got deleted.
 * Only for days already past; the future is a normal thing to plan.
 *
 * `children` replaces the default warning, because what's at stake differs per
 * screen: on the day view you'd strand new tasks, while closing an old day is
 * now safe and only worth mentioning.
 */
export function PastDayNotice({ date, children }: { date: string; children?: ReactNode }) {
  const router = useRouter();
  const today = todayISO();
  if (date >= today) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-warning/30 bg-accent-soft p-3">
      <CalendarClock className="h-4 w-4 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-fg">
        {children ?? (
          <>
            Estás viendo <span className="font-semibold">{fullDayLabel(date)}</span>, que ya pasó.
            Lo que agregues acá no aparece en Hoy.
          </>
        )}
      </p>
      <button
        onClick={() => router.push("/today")}
        className="shrink-0 cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        Ir a hoy
      </button>
    </div>
  );
}
