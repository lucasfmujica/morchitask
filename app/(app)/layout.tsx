import type { ReactNode } from "react";
import { AppChrome } from "@/components/layout/app-chrome";
import { TrialBanner } from "@/components/billing/trial-banner";

// Auth gating happens in the proxy; this is the app chrome, plus the one thing
// that has to be visible from every screen — a trial about to run out.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppChrome>
      <div className="flex flex-col gap-4">
        <TrialBanner />
        {children}
      </div>
    </AppChrome>
  );
}
