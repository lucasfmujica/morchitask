"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("tasks");
  // The canvas check: a 24px circle with a hairline ring that fills with the
  // fit gradient and pops a white tick. Round, not the old rounded square.
  const box = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const tick = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      aria-label={label ?? (checked ? t("markPending") : t("complete"))}
      whileTap={{ scale: 0.82 }}
      transition={{ duration: 0.12 }}
      className={cn(
        "relative flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-[background,box-shadow] duration-200",
        box,
        checked
          ? "bg-fit"
          : "bg-transparent shadow-[inset_0_0_0_1.5px_var(--color-border-strong)] hover:shadow-[inset_0_0_0_1.5px_var(--color-primary)]",
      )}
    >
      <motion.svg
        viewBox="0 0 16 16"
        className={tick}
        fill="none"
        stroke="var(--color-on-primary)"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        initial={false}
        animate={checked ? { scale: [0.3, 1.15, 1], opacity: 1 } : { scale: 0.3, opacity: 0 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
      >
        <path d="m3.5 8.5 3 3 6-7" />
      </motion.svg>
    </motion.button>
  );
}
