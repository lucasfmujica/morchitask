import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The bento "well": a recessed grey tray that groups related things, with white
 * cards (or plain content) inside. It replaces borders as the way sections are
 * told apart. Cards inside a well drop their border (`border-transparent`) and
 * keep `shadow-soft`.
 */
export const Well = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Well(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("rounded-2xl bg-surface-2 p-2", className)} {...props} />;
});
