"use client";

import { CalendarClock } from "lucide-react";
import { dueTone, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

const TONE_STYLES = {
  overdue: "bg-danger/10 text-danger",
  soon: "bg-warning/15 text-warning",
  later: "bg-surface-2 text-muted",
} as const;

/** Small pill showing a task's due date, coloured by urgency:
 *  red if overdue, amber if due today/tomorrow, grey otherwise. */
export function DueDateBadge({ dueDate, className }: { dueDate: string; className?: string }) {
  const t = useTranslations("tasks");
  const labels = useDateLabels();
  const today = todayISO();
  const tone = dueTone(dueDate, today);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-semibold",
        TONE_STYLES[tone],
        className,
      )}
      title={tone === "overdue" ? t("overdue") : t("due")}
    >
      <CalendarClock className="h-3 w-3" aria-hidden />
      {labels.dueLabel(dueDate, today)}
    </span>
  );
}
