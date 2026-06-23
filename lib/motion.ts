import type { Transition } from "framer-motion";

// Shared motion language — keep timing/easing consistent everywhere.
export const EASE_OUT = [0.33, 1, 0.68, 1] as const;
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const SPRING: Transition = { type: "spring", stiffness: 400, damping: 32 };
export const SPRING_SOFT: Transition = { type: "spring", stiffness: 260, damping: 26 };

export const FADE_IN = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, transition: { duration: 0.12 } },
  transition: { duration: 0.22, ease: EASE_OUT },
};
