"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarArrowUp, Check } from "lucide-react";
import { taskKeys, useMoveTaskToDate } from "@/lib/queries/tasks";
import { orderForAppend } from "@/lib/ordering";
import { addDays, fullDayLabel, todayISO, type DayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/queries/types";

/** sort_order that appends the task to the end of `date`'s list, read from the
 *  cache. Falls back to a high value when that day isn't loaded yet. */
function useAppendOrder() {
  const qc = useQueryClient();
  return (date: DayISO, taskId: string) => {
    const list = qc.getQueryData<Task[]>(taskKeys.date(date)) ?? [];
    return orderForAppend(list.filter((t) => t.id !== taskId).map((t) => t.sort_order));
  };
}

/** Quick reschedule options + a free date picker. Lets you move a task to
 *  another day without dragging — works on the Day view and on mobile. */
export function MoveToDayMenu({ task, align = "right" }: { task: Task; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const dateInputId = useId();
  const move = useMoveTaskToDate();
  const appendOrder = useAppendOrder();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const today = todayISO();
  const tomorrow = addDays(today, 1);
  // Monday of next week (or 7 days out if today is already Monday).
  const nextMonday = addDays(today, (1 - new Date(`${today}T00:00:00`).getDay() + 7) % 7 || 7);

  function moveTo(toDate: DayISO) {
    setOpen(false);
    if (toDate === task.planned_date) return;
    move.mutate({ task, toDate, sortOrder: appendOrder(toDate, task.id) });
  }

  const options: { label: string; date: DayISO }[] = [
    { label: "Hoy", date: today },
    { label: "Mañana", date: tomorrow },
    { label: "Próx. lunes", date: nextMonday },
  ];

  return (
    // Stop pointer events from bubbling to the card: on desktop the whole card
    // is the drag handle, and its sensor would otherwise swallow clicks here and
    // block the native date picker from opening.
    <div
      ref={ref}
      className="relative"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Mover a otro día"
        title="Mover a otro día"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:opacity-100",
          open ? "bg-surface-2 text-fg" : "opacity-0 group-hover:opacity-100 touch:opacity-100",
        )}
      >
        <CalendarArrowUp className="h-4 w-4" aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            role="menu"
            className={cn(
              "absolute z-50 mt-1 w-44 rounded-xl border border-border bg-surface p-1 shadow-card",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            <p className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
              Mover a
            </p>
            {options.map((o) => {
              const active = o.date === task.planned_date;
              return (
                <button
                  key={o.label}
                  type="button"
                  role="menuitem"
                  onClick={() => moveTo(o.date)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2",
                    active ? "font-medium text-primary" : "text-fg",
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span>{o.label}</span>
                    <span className="text-[11px] text-subtle">{fullDayLabel(o.date)}</span>
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                </button>
              );
            })}

            {/* Free date picker — native, so it works everywhere incl. mobile.
                We open it with showPicker() on click: on desktop a transparent
                stretched date input only focuses (the calendar lives on the
                hidden native icon), so the row appeared to do nothing. */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const el = dateInputRef.current;
                if (!el) return;
                try {
                  el.showPicker();
                } catch {
                  el.focus();
                }
              }}
              className="relative mt-0.5 flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-surface-2"
            >
              <span>Otra fecha…</span>
              <input
                ref={dateInputRef}
                id={dateInputId}
                type="date"
                defaultValue={task.planned_date ?? today}
                onChange={(e) => e.target.value && moveTo(e.target.value)}
                tabIndex={-1}
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
