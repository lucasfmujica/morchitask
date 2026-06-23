"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function buildTimes(stepMin = 30, startHour = 5, endHour = 24): string[] {
  const out: string[] = [];
  for (let m = startHour * 60; m < endHour * 60; m += stepMin) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

const TIMES = buildTimes();

export function TimePicker({
  value,
  onChange,
  placeholder = "Hora",
  align = "left",
  className,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-sm transition-colors hover:bg-surface-2",
          value ? "text-fg" : "text-subtle",
        )}
      >
        <Clock className="h-3.5 w-3.5 text-subtle" aria-hidden />
        {value ?? placeholder}
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "absolute z-50 mt-1 max-h-56 w-24 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-card",
              align === "right" ? "right-0" : "left-0",
            )}
            role="listbox"
          >
            {TIMES.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(t);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={t === value}
                  className={cn(
                    "w-full cursor-pointer rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-surface-2",
                    t === value ? "bg-primary-soft font-medium text-primary" : "text-fg",
                  )}
                >
                  {t}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
