import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Kbd } from "./kbd";

/**
 * The "nothing here yet" card.
 *
 * FULL-WIDTH REGIONS ONLY. A dashed card in a 320px week column or the 256px
 * sidebar looks absurd — those get a single muted line instead (see
 * `EmptyHint`). That distinction is the whole reason both exist.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  kbd,
  kbdHint,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  /** Optional keyboard tip, e.g. kbd="N" kbdHint="para una nueva tarea". */
  kbd?: string;
  kbdHint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-card border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <div>
        <p className="font-semibold text-fg">{title}</p>
        <p className="mt-1 text-sm text-muted">{hint}</p>
      </div>
      {action}
      {kbd && (
        <p className="mt-1 text-xs text-subtle">
          Tip: apretá <Kbd>{kbd}</Kbd> {kbdHint}
        </p>
      )}
    </div>
  );
}

/**
 * The narrow-region counterpart: one muted line, no border box.
 *
 * In a week column it doubles as the drop hint, since the column is already a
 * droppable — which is why it keeps a dashed outline but no padding to speak of.
 */
export function EmptyHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "flex min-h-11 items-center justify-center rounded-card border border-dashed border-border px-2 text-center text-2xs text-subtle",
        className,
      )}
    >
      {children}
    </p>
  );
}
