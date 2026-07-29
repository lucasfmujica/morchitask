import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A keyboard key. `font-sans` on purpose — the browser's default monospace
 *  for <kbd> looks foreign next to DM Sans. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-[22px] items-center justify-center rounded border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-2xs font-semibold text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
