"use client";

import { useDroppable } from "@dnd-kit/core";
import { priorityDropId, priorityLabel, PRIORITY_DOT, type PriorityKey } from "@/lib/priority";
import { cn } from "@/lib/utils";

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
  const { setNodeRef, isOver } = useDroppable({ id: priorityDropId(scope, priority) });
  const label = priorityLabel(priority);

  if (empty) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed text-[11px] font-medium transition-colors",
          compact ? "py-2" : "py-3",
          isOver
            ? "border-primary bg-primary-soft text-primary"
            : "border-border/70 text-subtle/70",
        )}
      >
        Soltá acá para {label}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-1.5 rounded-md transition-colors",
        compact ? "px-0.5 py-0.5 text-[10px]" : "px-1 py-1 text-[11px]",
        "font-semibold uppercase tracking-wide",
        isOver ? "bg-primary-soft text-primary" : "text-subtle",
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
