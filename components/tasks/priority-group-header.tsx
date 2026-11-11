"use client";

import { useDroppable } from "@dnd-kit/core";
import { priorityDropId, priorityLabelKey, PRIORITY_DOT, type PriorityKey } from "@/lib/priority";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * Separator above each priority group. It doubles as a drop target so you can
 * drag a card into a group that has no cards yet — otherwise the last task in
 * "Sin prioridad" could never be promoted by dragging.
 */
export function PriorityGroupHeader({
  scope,
  priority,
  count,
  empty = false,
  compact = false,
}: {
  /** The day this group belongs to — Week has one header per column. */
  scope: string;
  priority: PriorityKey;
  count?: number;
  /** Renders a taller "drop here" strip instead of a plain label. */
  empty?: boolean;
  /** Tighter styling for the narrow Week columns. */
  compact?: boolean;
}) {
  const t = useTranslations("tasks");
  const { setNodeRef, isOver } = useDroppable({ id: priorityDropId(scope, priority) });
  const label = t(priorityLabelKey(priority));

  if (empty) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "flex items-center justify-center rounded-xl text-2xs font-medium ring-1 transition-colors ring-inset",
          compact ? "py-2" : "py-3",
          isOver
            ? "bg-primary-soft text-primary ring-primary"
            : "bg-surface/40 text-subtle ring-border-strong/60",
        )}
      >
        {t("dropHereFor", { label })}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-1.5 rounded-pill transition-colors",
        compact ? "px-1.5 py-0.5 text-2xs" : "px-2 py-1 text-2xs",
        "font-semibold uppercase tracking-wide",
        isOver ? "bg-primary-soft text-primary" : "text-muted",
      )}
    >
      {priority && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: PRIORITY_DOT[priority] }}
          aria-hidden
        />
      )}
      <span>{label}</span>
      {count != null && <span className="font-normal tabular-nums opacity-60">{count}</span>}
    </div>
  );
}
