"use client";

import { dueTone, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useDateLabels } from "@/lib/use-date-labels";
import { useTranslations } from "next-intl";

// The highlighter is the deadline's mark, as in the design system: a swipe of
// yellow under the date, full strength whatever the distance (the faded 45%
// "later" tint read as disabled next to the canvas). Overdue trades the swipe for the alert colour (danger
// text on yellow is under 4.5:1 at this size); the label says "vencida" too.
const TONE_STYLES = {
  overdue: "bg-danger text-on-danger",
  soon: "bg-marker text-on-marker",
  later: "bg-marker text-on-marker",
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
        "inline-flex shrink-0 -rotate-[1.5deg] items-center rounded-[4px] px-1.5 py-0.5 font-mono text-[11px] leading-[14px] font-medium whitespace-nowrap uppercase",
        TONE_STYLES[tone],
        className,
      )}
      title={tone === "overdue" ? t("overdue") : t("due")}
    >
      {labels.dueTagLabel(dueDate, today)}
    </span>
  );
}
