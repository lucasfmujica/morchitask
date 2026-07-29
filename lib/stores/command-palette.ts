import { create } from "zustand";
import { persist } from "zustand/middleware";

/** How many recently-opened tasks the palette offers on an empty query. */
const MAX_RECENT_IDS = 12;

/** Whether the Cmd/Ctrl+K command palette is open, plus what you opened last. */
type CommandPaletteState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /**
   * Ids of tasks opened from the palette, most recent first. Persisted, and
   * kept as ids rather than task objects so a stale copy can never be rendered
   * — they're resolved against live query data, and anything that no longer
   * resolves is silently dropped.
   */
  recentTaskIds: string[];
  pushRecent: (taskId: string) => void;
};

export const useCommandPalette = create<CommandPaletteState>()(
  persist(
    (set) => ({
      isOpen: false,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      recentTaskIds: [],
      pushRecent: (taskId) =>
        set((s) => ({
          recentTaskIds: [taskId, ...s.recentTaskIds.filter((id) => id !== taskId)].slice(
            0,
            MAX_RECENT_IDS,
          ),
        })),
    }),
    {
      name: "morchitask:command-palette",
      // The palette always starts closed on load; only the history survives.
      partialize: (s) => ({ recentTaskIds: s.recentTaskIds }),
    },
  ),
);
