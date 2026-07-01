import { create } from "zustand";
import { persist } from "zustand/middleware";

type SidebarState = {
  /** Desktop: sidebar collapsed to a slim icon rail. Persisted. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  /** Mobile: the full sidebar is open as a slide-in drawer. Not persisted. */
  mobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
};

export const useSidebar = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
      mobileOpen: false,
      openMobile: () => set({ mobileOpen: true }),
      closeMobile: () => set({ mobileOpen: false }),
    }),
    {
      name: "morchitask:sidebar",
      // Only remember the desktop collapse choice; the mobile drawer always
      // starts closed on load.
      partialize: (s) => ({ collapsed: s.collapsed }),
    },
  ),
);
