"use client";

import { ChevronDown, ChevronsUp, Equal } from "lucide-react";
import { PRIORITY_LABEL, type PriorityKey, type TaskPriority } from "@/lib/priority";
import { cn } from "@/lib/utils";

const TONE_STYLES: Record<TaskPriority, string> = {
  high: "bg-danger/10 text-danger",
  medium: "bg-warning/15 text-warning",
  low: "bg-primary-soft text-primary",
};

const ICONS = { high: ChevronsUp, medium: Equal, low: ChevronDown } as const;

/** Solid colour for a 2px rail — for dense rows where a pill is too heavy. */
export const PRIORITY_RAIL: Record<TaskPriority, string> = {
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-primary",
};

/** Small pill showing a task's priority. Renders nothing for "sin prioridad" —
 *  the default state should cost no visual weight. */
export function PriorityBadge({
  priority,
  className,
}: {
  priority: PriorityKey;
  className?: string;
}) {
  if (!priority) return null;
  const Icon = ICONS[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
        TONE_STYLES[priority],
        className,
      )}
      title={`Prioridad ${PRIORITY_LABEL[priority].toLowerCase()}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
