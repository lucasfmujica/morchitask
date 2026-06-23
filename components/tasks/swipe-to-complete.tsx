"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion, type PanInfo } from "framer-motion";
import { Check } from "lucide-react";
import { useCoarsePointer } from "@/lib/use-coarse-pointer";

const THRESHOLD = 90; // px of rightward swipe to mark complete

/**
 * Wraps a task card so a rightward swipe marks it done. Touch devices only
 * (and never under reduced motion) — on desktop and during SSR it renders the
 * card untouched, so the reorder/cross-column drag-and-drop is unaffected.
 */
export function SwipeToComplete({
  disabled,
  onComplete,
  children,
}: {
  disabled?: boolean;
  onComplete: () => void;
  children: ReactNode;
}) {
  const coarse = useCoarsePointer();
  const reduce = useReducedMotion();

  if (!coarse || reduce || disabled) return <>{children}</>;

  function handleEnd(_: PointerEvent, info: PanInfo) {
    if (info.offset.x > THRESHOLD) onComplete();
  }

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-0 flex items-center rounded-xl bg-success/15 pl-4 text-success"
        aria-hidden
      >
        <Check className="h-5 w-5" />
      </div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.04, right: 0.6, top: 0, bottom: 0 }}
        onDragEnd={handleEnd}
        className="relative"
      >
        {children}
      </motion.div>
    </div>
  );
}
