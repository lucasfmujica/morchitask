"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";

export function TaskCheckbox({
  checked,
  onToggle,
  size = "md",
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
  label?: string;
}) {
  const box = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const tick = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={label ?? (checked ? "Marcar como pendiente" : "Completar tarea")}
      whileTap={{ scale: 0.82 }}
      transition={{ duration: 0.12 }}
      className={cn(
        "relative flex shrink-0 cursor-pointer items-center justify-center rounded-md border-2 transition-colors",
        box,
        checked ? "border-primary bg-primary" : "border-gray-300 hover:border-primary",
      )}
    >
      <motion.svg
        viewBox="0 0 24 24"
        className={tick}
        fill="none"
        stroke="var(--color-on-primary)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <motion.path
          d="M5 13l4 4L19 7"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        />
      </motion.svg>
    </motion.button>
  );
}
