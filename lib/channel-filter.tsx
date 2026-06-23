"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type ChannelFilter = {
  /** Selected channel ids. Empty set means "Todas" (show everything). */
  selected: Set<string>;
  toggle: (id: string) => void;
  clear: () => void;
};

const ChannelFilterContext = createContext<ChannelFilter | null>(null);

/** First path segment, e.g. "week" for /week/2026-06-23 or "today" for /today. */
function sectionOf(pathname: string) {
  return pathname.split("/")[1] ?? "";
}

/**
 * Shares the category filter between the sidebar (where you pick categories) and
 * the views that consume it (currently the Week view). The filter is scoped to a
 * section: it persists while you page between weeks but resets when you switch to
 * a different area (Hoy, Backlog…), so a hidden filter never lingers unseen.
 */
export function ChannelFilterProvider({ children }: { children: ReactNode }) {
  const section = sectionOf(usePathname());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset the filter when switching to a different section — adjusted during
  // render (no effect), so a hidden filter never lingers across areas.
  const [trackedSection, setTrackedSection] = useState(section);
  if (trackedSection !== section) {
    setTrackedSection(section);
    setSelected(new Set());
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clear() {
    setSelected(new Set());
  }

  return (
    <ChannelFilterContext.Provider value={{ selected, toggle, clear }}>
      {children}
    </ChannelFilterContext.Provider>
  );
}

export function useChannelFilter() {
  const ctx = useContext(ChannelFilterContext);
  if (!ctx) throw new Error("useChannelFilter must be used within ChannelFilterProvider");
  return ctx;
}
