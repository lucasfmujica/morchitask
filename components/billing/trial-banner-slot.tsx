"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/lib/stores/sidebar";
import { useHydrated } from "@/lib/use-hydrated";
import { isRitualRoute } from "@/components/layout/app-chrome";

/**
 * Shows the trial banner only where the sidebar's trial chip can't be seen.
 *
 * The chip says the same thing in the same last days, so on a desktop with the
 * sidebar open the banner would be the second copy of one message on screen.
 * It stays on the phone, where the chip lives in a drawer that is closed by
 * default, and on desktop whenever the sidebar is hidden (folded away, or
 * during a ritual).
 *
 * `contents` rather than a box: the layout spaces its children with a gap, and
 * an empty wrapper on every screen would push every page down for everyone not
 * on a trial.
 *
 * The folded-sidebar choice lives in localStorage, which the server can't
 * read, so it only counts once hydrated: until then this renders what the
 * server did (the sidebar's default, open), instead of a mismatch.
 */
export function TrialBannerSlot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const collapsed = useSidebar((s) => s.collapsed);
  const hydrated = useHydrated();
  const sidebarHidden = (hydrated && collapsed) || isRitualRoute(pathname);
  return <div className={sidebarHidden ? "contents" : "contents md:hidden"}>{children}</div>;
}
