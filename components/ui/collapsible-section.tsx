"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A full-width header that folds a list away.
 *
 * The day list uses two of these at its foot — what's finished and what has no
 * day yet. Both are things you want counted and reachable, not in your face:
 * the label carries the whole summary ("5 hechas · 6h 6m medidas") so the
 * collapsed state still answers the question most of the time.
 */
export function CollapsibleSection({
  icon: Icon,
  label,
  iconClassName,
  tone = "filled",
  defaultOpen = false,
  children,
  className,
}: {
  icon: LucideIcon;
  label: ReactNode;
  iconClassName?: string;
  /** `filled` = done work (settled); `dashed` = an inbox you can pull from. */
  tone?: "filled" | "dashed";
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // `defaultOpen` can arrive late — it's often a media query, which only knows
  // the answer after mount. Follow it when it changes, but never fight a
  // deliberate toggle: the effect re-runs on the prop, not on `open`.
  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
          tone === "dashed"
            ? "border border-dashed border-border-strong hover:bg-surface-2"
            : "bg-surface-2 hover:bg-border",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", iconClassName ?? "text-subtle")} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-muted">{label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-subtle transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
