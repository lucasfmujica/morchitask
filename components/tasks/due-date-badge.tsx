"use client";

import { CalendarClock } from "lucide-react";
import { dueLabel, dueTone, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

const TONE_STYLES = {
  overdue: "bg-danger/10 text-danger",
  soon: "bg-warning/15 text-warning",
  later: "bg-surface-2 text-muted",
} as const;

/** Small pill showing a task's due date, coloured by urgency:
 *  red if overdue, amber if due today/tomorrow, grey otherwise. */
export function DueDateBadge({ dueDate, className }: { dueDate: string; className?: string }) {
  const today = todayISO();
  const tone = dueTone(dueDate, today);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
        TONE_STYLES[tone],
        className,
      )}
      title={tone === "overdue" ? "Tarea vencida" : "Vence"}
    >
      <CalendarClock className="h-3 w-3" aria-hidden />
      {dueLabel(dueDate, today)}
    </span>
  );
}
