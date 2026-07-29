import { cn } from "@/lib/utils";

/** A single shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} aria-hidden />;
}

/**
 * Placeholder rows shaped like task cards.
 *
 * `rowClassName` exists so each caller can match its own card height — a
 * skeleton that's the wrong height just moves the layout jump from "content
 * appears" to "content settles".
 */
export function SkeletonList({
  count = 3,
  rowClassName = "h-[76px]",
  className,
}: {
  count?: number;
  rowClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn("rounded-card border border-border", rowClassName)} />
      ))}
    </div>
  );
}
