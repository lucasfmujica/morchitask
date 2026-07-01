"use client";

import { useChannels } from "@/lib/queries/channels";
import { useChannelFilter } from "@/lib/channel-filter";
import { cn } from "@/lib/utils";

/**
 * Horizontal category filter that sits at the top of the Day / Week views (in
 * addition to the sidebar list). Shares the same `useChannelFilter` context, so
 * toggling here stays in sync with the sidebar. Tap a chip to show only that
 * category; "Todas" clears the filter. Hidden when you have no categories yet.
 */
export function ChannelFilterBar() {
  const channels = useChannels().data ?? [];
  const { selected, toggle, clear } = useChannelFilter();

  if (channels.length === 0) return null;

  return (
    <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Chip active={selected.size === 0} onClick={clear}>
        Todas
      </Chip>
      {channels.map((c) => {
        const active = selected.has(c.id);
        return (
          <Chip key={c.id} active={active} onClick={() => toggle(c.id)}>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: c.color }}
              aria-hidden
            />
            <span className="truncate">{c.name}</span>
          </Chip>
        );
      })}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary-soft text-primary"
          : "border-border text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
