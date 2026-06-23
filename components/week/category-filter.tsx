"use client";

import { ListFilter } from "lucide-react";
import type { Channel } from "@/lib/queries/types";
import { cn } from "@/lib/utils";

/**
 * Category (channel) filter for the Week view. Selecting channels narrows the
 * tasks shown across all seven day columns; an empty selection means "Todas".
 * Scoped to the week — state lives in WeekView, not globally.
 */
export function CategoryFilter({
  channels,
  selected,
  onChange,
}: {
  channels: Channel[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  if (channels.length === 0) return null;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  const all = selected.size === 0;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
        <ListFilter className="h-3.5 w-3.5" aria-hidden />
        Categorías
      </div>

      <button
        onClick={() => onChange(new Set())}
        aria-pressed={all}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
          all
            ? "bg-surface-2 font-semibold text-fg"
            : "text-muted hover:bg-surface-2 hover:text-fg",
        )}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br from-primary to-accent"
          aria-hidden
        />
        Todas
      </button>

      <ul className="flex flex-col gap-0.5">
        {channels.map((c) => {
          const on = selected.has(c.id);
          return (
            <li key={c.id}>
              <button
                onClick={() => toggle(c.id)}
                aria-pressed={on}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                  on
                    ? "bg-surface-2 font-medium text-fg"
                    : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full transition-all"
                  style={{
                    backgroundColor: c.color,
                    ...(on
                      ? { boxShadow: `0 0 0 2px var(--surface), 0 0 0 3.5px ${c.color}` }
                      : {}),
                  }}
                  aria-hidden
                />
                <span className="truncate">{c.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
