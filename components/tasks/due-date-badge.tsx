"use client";

import { dueTone, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

// The highlighter is the deadline's mark, as in the design system: a swipe of
// yellow under the date. Overdue trades the swipe for the alert colour (danger
// text on yellow is under 4.5:1 at this size); the label says "vencida" too.
const TONE_STYLES = {
  overdue: "bg-danger text-on-danger",
  soon: "bg-marker text-on-marker",
  later: "bg-marker/45 text-on-marker",
} as const;

/** The due date as a highlighter mark, slightly tilted like a real one. */
export function DueDateBadge({ dueDate, className }: { dueDate: string; className?: string }) {
  const t = useTranslations("tasks");
  const labels = useDateLabels();
  const today = todayISO();
  const tone = dueTone(dueDate, today);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 -rotate-1 items-center rounded-sm px-1.5 py-px font-mono text-2xs font-medium whitespace-nowrap uppercase",
        TONE_STYLES[tone],
        className,
      )}
      title={tone === "overdue" ? t("overdue") : t("due")}
    >
      {labels.dueLabel(dueDate, today)}
    </span>
  );
}
